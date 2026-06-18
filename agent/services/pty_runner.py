"""Chạy một CLI dưới pseudo-terminal (PTY) và bắt output đã làm sạch ANSI.

Một số agent CLI (vd Antigravity `agy`) là ứng dụng TUI: ở print mode chúng chỉ
render ra terminal thật, pipe stdout thì rỗng. Để bắt được kết quả qua HTTP, ta
chạy chúng dưới một PTY giả: ConPTY (pywinpty) trên Windows, module `pty` trên
POSIX. Output thô lẫn escape-code ANSI nên được strip về plain text.
"""
import os
import re
import sys
import time

# Strip ANSI/VT: CSI, OSC (kết bằng BEL hoặc ST), và escape 1-ký-tự.
_ANSI_RE = re.compile(
    r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\))",
    re.DOTALL,
)
# Ký tự điều khiển còn sót (giữ \n, \t).
_CTRL_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")


def strip_ansi(text: str) -> str:
    text = _ANSI_RE.sub("", text)
    text = _CTRL_RE.sub("", text)
    return text.replace("\r\n", "\n").replace("\r", "\n")


class PtyTimeout(Exception):
    """Tiến trình PTY vượt quá deadline."""


def run_pty(argv: list[str], *, cwd: str, env: dict[str, str],
            timeout: float, cols: int = 120, rows: int = 40) -> tuple[int, str]:
    """Chạy argv dưới PTY, trả (exit_code, output_đã_strip_ANSI). Blocking.

    Gọi từ async qua asyncio.to_thread. Hết timeout → kill + PtyTimeout.
    """
    if sys.platform == "win32":
        return _run_pty_windows(argv, cwd, env, timeout, cols, rows)
    return _run_pty_posix(argv, cwd, env, timeout, cols, rows)


def _run_pty_windows(argv, cwd, env, timeout, cols, rows) -> tuple[int, str]:
    from winpty import PtyProcess  # pywinpty

    proc = PtyProcess.spawn(argv, cwd=cwd, env=env, dimensions=(rows, cols))
    buf: list[str] = []
    deadline = time.monotonic() + timeout
    try:
        while True:
            if time.monotonic() > deadline:
                raise PtyTimeout
            try:
                data = proc.read(4096)
            except EOFError:
                break
            if data:
                buf.append(data)
            elif not proc.isalive():
                break
            else:
                time.sleep(0.02)
        exit_code = proc.wait()
    except PtyTimeout:
        try:
            proc.terminate(force=True)
        except Exception:
            pass
        raise
    finally:
        try:
            proc.close()
        except Exception:
            pass
    return exit_code, strip_ansi("".join(buf))


def _run_pty_posix(argv, cwd, env, timeout, cols, rows) -> tuple[int, str]:
    import fcntl
    import pty
    import select
    import signal
    import struct
    import termios

    pid, fd = pty.fork()
    if pid == 0:  # child
        try:
            os.chdir(cwd)
        except Exception:
            pass
        os.execvpe(argv[0], argv, env)
        os._exit(127)

    # set window size
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except Exception:
        pass

    buf: list[str] = []
    status = 0
    deadline = time.monotonic() + timeout
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise PtyTimeout
            r, _, _ = select.select([fd], [], [], min(remaining, 0.5))
            if fd in r:
                try:
                    chunk = os.read(fd, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                buf.append(chunk.decode("utf-8", "replace"))
            reaped, st = os.waitpid(pid, os.WNOHANG)
            if reaped != 0:
                status = st
                # drain remaining output
                while True:
                    r, _, _ = select.select([fd], [], [], 0.1)
                    if fd not in r:
                        break
                    try:
                        chunk = os.read(fd, 4096)
                    except OSError:
                        break
                    if not chunk:
                        break
                    buf.append(chunk.decode("utf-8", "replace"))
                break
        exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1
    except PtyTimeout:
        try:
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
        raise
    finally:
        try:
            os.close(fd)
        except Exception:
            pass
    return exit_code, strip_ansi("".join(buf))
