import React from "react";
import { useWorkflow } from "../../context/WorkflowContext";
import { WorkflowStep } from "../../types/workflow";

const STEPS = [
  { number: 1, label: "Setup Your Story" },
  { number: 2, label: "Review Screenplay" },
  { number: 2.6, label: "Review Assets" },
  { number: 3, label: "Generate Storyboard" },
  { number: 4, label: "Review Images" },
  { number: 4.5, label: "Final Review" },
  { number: 5, label: "Done" },
];

export default function Sidebar() {
  const { state, actions } = useWorkflow();
  const { currentStep } = state;

  const canGoBack = currentStep > 1;
  const canGoForward = currentStep < 5;

  const handleBack = () => {
    if (currentStep === 2.6) {
      actions.goToStep(2);
    } else if (currentStep === 3) {
      actions.goToStep(2.6);
    } else if (currentStep === 4.5) {
      actions.goToStep(4);
    } else if (currentStep === 5) {
      actions.goToStep(4.5);
    } else {
      actions.goToStep((currentStep - 1) as WorkflowStep);
    }
  };

  const handleForward = () => {
    if (currentStep === 2) {
      actions.goToStep(2.6);
    } else if (currentStep === 2.6) {
      actions.goToStep(3);
    } else if (currentStep === 4) {
      actions.goToStep(4.5);
    } else if (currentStep === 4.5) {
      actions.goToStep(5);
    } else {
      actions.goToStep((currentStep + 1) as WorkflowStep);
    }
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-neutral-800 bg-neutral-950 px-6 py-6">
      {/* Project Name */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white">Project</h2>
        <p className="truncate text-sm text-neutral-500">Video Generation</p>
      </div>

      {/* Progress Steps */}
      <div className="flex-1">
        <div className="space-y-3">
          {STEPS.map((step) => {
            const isDone = step.number < currentStep;
            const isCurrent = step.number === currentStep;

            return (
              <div key={step.number} className="flex items-start gap-3">
                {/* Step Circle */}
                <div
                  className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-semibold text-sm ${
                    isDone
                      ? "bg-green-600 text-white"
                      : isCurrent
                        ? "bg-indigo-600 text-white"
                        : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {isDone ? "✓" : step.number}
                </div>

                {/* Step Label */}
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      isCurrent
                        ? "text-white"
                        : isDone
                          ? "text-neutral-400"
                          : "text-neutral-500"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>

                {/* Status Indicator */}
                {isCurrent && <div className="mt-1 h-2 w-2 rounded-full bg-indigo-400" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-2 border-t border-neutral-800 pt-6">
        <button
          onClick={handleBack}
          disabled={!canGoBack}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            canGoBack
              ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              : "bg-neutral-900 text-neutral-600 cursor-not-allowed"
          }`}
        >
          ← Back
        </button>

        <button
          onClick={handleForward}
          disabled={!canGoForward}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            canGoForward
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-neutral-900 text-neutral-600 cursor-not-allowed"
          }`}
        >
          Next →
        </button>
      </div>

      {/* Settings Button */}
      <div className="mt-4">
        <button className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
          ⚙ Settings
        </button>
      </div>
    </div>
  );
}
