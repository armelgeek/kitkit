import React from "react";
import { useWorkflow } from "../../context/WorkflowContext";
import Step1Setup from "./Step1Setup";
import Step2ReviewScreenplay from "./Step2ReviewScreenplay";
import Step3ReviewStoryboard from "./Step3ReviewStoryboard";
import Step4Done from "./Step4Done";

export default function MainContent() {
  const { state } = useWorkflow();
  const { currentStep } = state;

  switch (currentStep) {
    case 1:
      return <Step1Setup />;
    case 2:
      return <Step2ReviewScreenplay />;
    case 3:
      return <Step3ReviewStoryboard />;
    case 4:
      return <Step4Done />;
    default:
      return <div className="flex-1 flex items-center justify-center bg-neutral-950 text-neutral-400">Unknown step</div>;
  }
}
