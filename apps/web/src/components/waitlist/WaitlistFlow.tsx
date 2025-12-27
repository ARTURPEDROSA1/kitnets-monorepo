"use client";

import React from "react";
import { useWaitlist } from "./WaitlistContext";
import { Step1Profile } from "./Step1Profile";
import { Step2Identity } from "./Step2Identity";
import { Step3Portfolio } from "./Step3Portfolio";
import { Step4Location } from "./Step4Location";
import { Step5Contact } from "./Step5Contact";
import { Step6Success } from "./Step6Success";

export function WaitlistFlow() {
    const { stepId } = useWaitlist();

    switch (stepId) {
        case "profile":
            return <Step1Profile />;
        case "identity":
            return <Step2Identity />;
        case "portfolio":
            return <Step3Portfolio />;
        case "location":
            return <Step4Location />;
        case "contact":
            return <Step5Contact />;
        case "success":
            return <Step6Success />;
        default:
            return <div>Step not found</div>;
    }
}
