/**
 * Wrappers for the values the sidebar privacy toggles can hide (lib/privacy.ts):
 *
 *   <Money>{brl(total)}</Money>            hidden by the dollar button (data-hide-money on <html>)
 *   <Sensitive>{fullAddress}</Sensitive>   hidden by the eye button (data-hide-sensitive on <html>)
 *
 * They render a plain element with the `privacy-money` / `privacy-sensitive` class; the blur comes from
 * CSS in globals.css, so they work in server and client components alike and react to the toggle
 * without a refresh. When a wrapper does not fit (a <td> with colSpan, a chart container that is not
 * ours), put the class straight on the element. `cover` uses a much stronger blur for large regions
 * such as maps. Keep the value out of `title` attributes of the wrapper's ancestors: tooltips are not
 * blurred.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

type Tag = "span" | "div" | "p" | "td" | "th" | "dd" | "dt" | "li" | "strong" | "em" | "b" | "small" | "h1" | "h2" | "h3" | "h4" | "figure" | "section";

export interface PrivateValueProps extends React.HTMLAttributes<HTMLElement> {
    /** element to render, span by default */
    as?: Tag;
    /** stronger blur for maps and other large regions */
    cover?: boolean;
    children?: React.ReactNode;
}

/** An amount in R$ (or anything that reveals one). Hidden by the dollar button. */
export function Money({ as: Tag = "span", cover, className, ...rest }: PrivateValueProps) {
    return <Tag className={cn("privacy-money", cover && "privacy-cover", className)} {...rest} />;
}

/** An address, CEP, CPF/CNPJ/RG, meter or consumer-unit number, bank account, phone or e-mail. Hidden by the eye button. */
export function Sensitive({ as: Tag = "span", cover, className, ...rest }: PrivateValueProps) {
    return <Tag className={cn("privacy-sensitive", cover && "privacy-cover", className)} {...rest} />;
}
