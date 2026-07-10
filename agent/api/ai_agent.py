"""AI Agent CLI endpoints for running headless agent CLIs as subprocesses.

Allows calling coding-agent CLIs (Codex, Claude Code, Antigravity, ...) over HTTP to
automate tasks such as writing scripts, generating prompts, and editing files in a
working directory. The agent runs non-interactively and bypasses permissions by
default, so it can write files and run commands freely. Expose only on 127.0.0.1.

Also supports calling Claude via the Anthropic API directly (set use_api=true in config).

The agent registry and default flags live in `agent/config.py` (`AI_AGENTS`) and can
be overridden with env vars if the CLI binary or flags change.
"""
import asyncio
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent.config import (
    AGENT_CLI_TIMEOUT,
    AGENT_PROMPT_ARG_MAX,
    AGENT_PTY_COLS,
    AGENT_PTY_ROWS,
    AGENT_SKIP_PERMISSIONS,
    ANTHROPIC_API_KEY,
    CLAUDE_MODELS,
    AI_AGENTS,
)
from agent.services.pty_runner import PtyTimeout, run_pty

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


# ─── Models ──────────────────────────────────────────────────

class RunRequest(BaseModel):
    agent: str                              # key trong AI_AGENTS (vd "codex")
    prompt: str                             # nội dung giao cho agent
    cwd: Optional[str] = None               # working directory (defaults to current)
    model: Optional[str] = None             # override model key của CLI
    timeout: Optional[float] = None         # seconds; defaults to AGENT_CLI_TIMEOUT
    extra_args: Optional[list[str]] = None  # extra flags passed directly to the CLI
    skip_permissions: Optional[bool] = None  # override permission bypass
    env: Optional[dict[str, str]] = None    # extra environment variables for the process


# ─── Helpers ─────────────────────────────────────────────────

def _resolve_bin(cfg: dict) -> Optional[str]:
    """Return the PATH-resolved binary path, or None if it is not found."""
    return shutil.which(cfg["bin"])


def _build_command(cfg: dict, body: RunRequest,
                   cwd: str) -> tuple[list[str], Optional[str], Optional[str]]:
    """Build `(argv, stdin_text, tmp_prompt_path)`.

    `base_args` are placed at the end, right before the prompt, because some CLIs use
    value-taking flags like `-p <prompt>` and the flag must stay adjacent to the prompt.

    If `prompt_mode` is "arg" and the prompt is too long for the Windows command-line
    limit, write it to a temp file in `cwd` and replace it with a short instruction that
    tells the agent to read that file.
    """
    argv = [cfg["bin"]]

    if body.model and cfg.get("model_flag"):
        argv += [cfg["model_flag"], body.model]

    skip = AGENT_SKIP_PERMISSIONS if body.skip_permissions is None else body.skip_permissions
    if skip:
        argv += cfg.get("skip_perm", [])

    if body.extra_args:
        argv += body.extra_args

    argv += cfg.get("base_args", [])

    if cfg.get("prompt_mode") == "arg":
        if len(body.prompt) > AGENT_PROMPT_ARG_MAX:
            fd, path = tempfile.mkstemp(prefix="flowkit_prompt_", suffix=".txt", dir=cwd)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(body.prompt)
            directive = (
                "Your full task is in this UTF-8 text file (read it completely):\n"
                f"{path}\n"
                "Do EXACTLY what that file asks and output ONLY what it requests "
                "(e.g. raw JSON if it asks for JSON). Do not mention this file."
            )
            argv.append(directive)
            return argv, None, path
        argv.append(body.prompt)
        return argv, None, None
    return argv, body.prompt, None  # stdin mode


async def _run_via_api(body: "RunRequest", cfg: dict, timeout: float) -> dict:
    """Call Claude via Anthropic API (no subprocess). Returns same shape as /run."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")

    from anthropic import Anthropic

    started = time.monotonic()
    try:
        client = Anthropic(api_key=ANTHROPIC_API_KEY)
        model = body.model or cfg.get("model", "claude-opus-4-8")

        response = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": body.prompt}
            ],
        )

        output = ""
        for block in response.content:
            if hasattr(block, "text"):
                output += block.text
        duration = round(time.monotonic() - started, 2)

        logger.info("agent/run done (api): %s model=%s in %ss",
                    body.agent, model, duration)

        return {
            "ok": True,
            "agent": body.agent,
            "exit_code": 0,
            "stdout": output,
            "stderr": "",
            "duration": duration,
            "cwd": os.getcwd(),
            "api": True,
        }
    except Exception as e:
        logger.error("agent/run api error: %s", e)
        raise HTTPException(500, f"API call failed: {str(e)}")


async def _run_via_pty(body: "RunRequest", argv: list[str],
                       cwd: str, env: dict, timeout: float) -> dict:
    """Chạy agent TUI dưới PTY trong thread executor; trả cùng shape với /run."""
    started = time.monotonic()
    try:
        exit_code, output = await asyncio.to_thread(
            run_pty, argv, cwd=cwd, env=env, timeout=timeout,
            cols=AGENT_PTY_COLS, rows=AGENT_PTY_ROWS,
        )
    except PtyTimeout:
        raise HTTPException(504, f"Agent '{body.agent}' vượt quá timeout {timeout}s")
    except ModuleNotFoundError as e:
        raise HTTPException(
            500, f"Thiếu backend PTY ({e}). Cài 'pywinpty' (Windows): "
                 f"pip install pywinpty")
    except Exception as e:
        raise HTTPException(500, f"Lỗi chạy PTY cho '{body.agent}': {e}")

    duration = round(time.monotonic() - started, 2)
    logger.info("agent/run done (pty): %s exit=%s in %ss",
                body.agent, exit_code, duration)
    return {
        "ok": exit_code == 0,
        "agent": body.agent,
        "exit_code": exit_code,
        "stdout": output,
        "stderr": "",          # PTY gộp chung stdout/stderr
        "duration": duration,
        "cwd": cwd,
        "pty": True,
    }


# ─── Endpoints ───────────────────────────────────────────────

@router.get("/agents")
async def list_agents():
    """Liệt kê agent đã cấu hình + binary có sẵn trên máy hay không."""
    agents = []
    for key, cfg in AI_AGENTS.items():
        agent_info = {
            "key": key,
            "supports_model": bool(cfg.get("model_flag")) or cfg.get("use_api", False),
            "pty": bool(cfg.get("pty")),
        }
        if cfg.get("use_api"):
            agent_info.update({
                "use_api": True,
                "model": cfg.get("model", "claude-3-5-sonnet-20241022"),
                "available": bool(ANTHROPIC_API_KEY),
                "available_models": CLAUDE_MODELS,
            })
        else:
            agent_info.update({
                "use_api": False,
                "bin": cfg["bin"],
                "available": _resolve_bin(cfg) is not None,
                "path": _resolve_bin(cfg),
                "prompt_mode": cfg.get("prompt_mode"),
            })
        agents.append(agent_info)

    return {
        "skip_permissions_default": AGENT_SKIP_PERMISSIONS,
        "timeout_default": AGENT_CLI_TIMEOUT,
        "anthropic_api_key_set": bool(ANTHROPIC_API_KEY),
        "claude_models": CLAUDE_MODELS,
        "agents": agents,
    }


@router.post("/run")
async def run_agent(body: RunRequest):
    """Chạy một agent CLI headless hoặc via API, trả về stdout/stderr/exit_code.

    Lỗi: 404 agent không tồn tại; 503 binary chưa cài; 400 cwd sai;
    504 quá timeout. Tiến trình bị kill khi timeout.
    """
    cfg = AI_AGENTS.get(body.agent)
    if cfg is None:
        raise HTTPException(404, f"Agent '{body.agent}' không tồn tại. "
                                 f"Có: {', '.join(AI_AGENTS)}")

    timeout = body.timeout or AGENT_CLI_TIMEOUT

    # Use Anthropic API if configured
    if cfg.get("use_api"):
        logger.info("agent/run: %s (api mode) timeout=%ss", body.agent, timeout)
        return await _run_via_api(body, cfg, timeout)

    # Otherwise use CLI subprocess
    if _resolve_bin(cfg) is None:
        raise HTTPException(503, f"Binary '{cfg['bin']}' chưa cài hoặc không có trong PATH")

    cwd = body.cwd or os.getcwd()
    if not Path(cwd).is_dir():
        raise HTTPException(400, f"cwd không phải thư mục hợp lệ: {cwd}")

    argv, stdin_text, tmp_prompt = _build_command(cfg, body, cwd)
    proc_env = {**os.environ, **(body.env or {})}

    logger.info("agent/run: %s argv=%s cwd=%s timeout=%ss pty=%s prompt_file=%s",
                body.agent, argv, cwd, timeout, bool(cfg.get("pty")), bool(tmp_prompt))

    try:
        # TUI agents (for example `agy`) only render to a terminal, so run them under a
        # PTY, capture the output, and strip ANSI sequences.
        if cfg.get("pty"):
            return await _run_via_pty(body, argv, cwd, proc_env, timeout)

        started = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                cwd=cwd,
                env=proc_env,
                stdin=asyncio.subprocess.PIPE if stdin_text is not None else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (FileNotFoundError, OSError) as e:
            raise HTTPException(503, f"Không khởi chạy được '{cfg['bin']}': {e}")

        stdin_bytes = stdin_text.encode("utf-8") if stdin_text is not None else None
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=stdin_bytes), timeout=timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise HTTPException(504, f"Agent '{body.agent}' vượt quá timeout {timeout}s")

        duration = round(time.monotonic() - started, 2)
        out = stdout.decode("utf-8", "replace") if stdout else ""
        err = stderr.decode("utf-8", "replace") if stderr else ""
        logger.info("agent/run done: %s exit=%s in %ss", body.agent, proc.returncode, duration)

        return {
            "ok": proc.returncode == 0,
            "agent": body.agent,
            "exit_code": proc.returncode,
            "stdout": out,
            "stderr": err,
            "duration": duration,
            "cwd": cwd,
        }
    finally:
        if tmp_prompt:
            try:
                os.unlink(tmp_prompt)
            except OSError:
                pass
