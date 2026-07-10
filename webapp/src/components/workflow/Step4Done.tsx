import React, { useEffect } from "react";
import { useWorkflow } from "../../context/WorkflowContext";

export default function Step4Done() {
  const { state, actions } = useWorkflow();
  const { videoStatus, videoUrl, error, generationJobId } = state;

  // Poll for video status when generating
  useEffect(() => {
    if (videoStatus === "generating" && generationJobId) {
      const interval = setInterval(() => {
        actions.pollVideoStatus();
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [videoStatus, generationJobId, actions]);

  const handleTryAnother = () => {
    actions.resetWorkflow();
  };

  const handleEdit = () => {
    actions.goToStep(3);
  };

  const handleDownload = () => {
    if (videoUrl) {
      const link = document.createElement("a");
      link.href = videoUrl;
      link.download = "generated-video.mp4";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Generating State */}
        {videoStatus === "generating" && (
          <div className="flex flex-col items-center justify-center min-h-96">
            <h1 className="mb-2 text-2xl font-bold text-white">Generating Your Video...</h1>
            <p className="mb-8 text-neutral-400">This may take a few minutes. Please wait.</p>

            <div className="mb-8">
              <div className="h-12 w-12 border-4 border-neutral-700 border-t-indigo-600 animate-spin inline-block" />
            </div>

            <p className="mb-2 text-lg text-neutral-300">Processing your video...</p>
            <p className="text-neutral-500">This process may take 3-5 minutes</p>
          </div>
        )}

        {/* Done State */}
        {videoStatus === "done" && (
          <div>
            <div className="mb-8">
              <h1 className="mb-2 text-2xl font-bold text-green-400">✓ Your Video is Ready!</h1>
              <p className="text-neutral-400">Your video has been generated successfully.</p>
            </div>

            {/* Video Preview Section */}
            <div className="mb-8 rounded-lg bg-neutral-900 overflow-hidden">
              <div className="aspect-video bg-neutral-800 flex items-center justify-center">
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    className="w-full h-full"
                    controlsList="nodownload"
                  />
                ) : (
                  <div className="text-neutral-500">Video preview unavailable</div>
                )}
              </div>
            </div>

            {/* Success Badge */}
            <div className="mb-8 inline-block rounded-full bg-green-950 px-4 py-2 text-sm font-medium text-green-300">
              ✓ Generation complete!
            </div>

            <p className="mb-8 text-neutral-400">Your video is ready to download and share.</p>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleEdit}
                className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
              >
                Edit & Regenerate
              </button>
              <button
                onClick={handleDownload}
                className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 transition"
              >
                Download Video
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {videoStatus === "error" && (
          <div>
            <div className="mb-8">
              <h1 className="mb-2 text-2xl font-bold text-red-400">✗ Generation Failed</h1>
              <p className="text-neutral-400">{error || "An error occurred during video generation."}</p>
            </div>

            {/* Error Box */}
            <div className="mb-8 rounded-lg bg-red-950 border border-red-800 p-6">
              <p className="text-red-200">
                {error || "An unexpected error occurred. Please try again."}
              </p>
            </div>

            {/* Try Another Project Button */}
            <button
              onClick={handleTryAnother}
              className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 transition"
            >
              Try Another Project
            </button>
          </div>
        )}

        {/* Try Another Project Button - Always Show at Bottom */}
        {videoStatus !== "error" && (
          <div className="mt-12 pt-8 border-t border-neutral-800">
            <button
              onClick={handleTryAnother}
              className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
            >
              Try Another Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
