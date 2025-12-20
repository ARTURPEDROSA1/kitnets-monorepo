"use client";

import React from "react";
import { useAnunciar } from "./AnunciarContext";
import { Step1Profile } from "./Step1Profile";
import { Step2Intent } from "./Step2Intent";
import { Step3Type } from "./Step3Type";
import { Step4Location } from "./Step4Location";
import { Step5Details } from "./Step5Details";
import { Step6Media } from "./Step6Media";
import { Step7Description } from "./Step7Description";
import { Step8Contact } from "./Step8Contact";
import { Step9Review } from "./Step9Review";
import { Step10Success } from "./Step10Success";

export function AnunciarFlow() {
    const { stepId } = useAnunciar();

    switch (stepId) {
        case "profile":
            return <Step1Profile />;
        case "intent":
            return <Step2Intent />;
        case "type":
            return <Step3Type />;
        case "location":
            return <Step4Location />;
        case "details":
            return <Step5Details />;
        case "media":
            return <Step6Media />;
        case "description":
            return <Step7Description />;
        case "contact":
            return <Step8Contact />;
        case "review":
            return <Step9Review />;
        case "success":
            return <Step10Success />;
        default:
            return <div>Step not found</div>;
    }
}
