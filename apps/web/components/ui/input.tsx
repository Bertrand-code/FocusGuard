import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("w-full rounded-xl border border-emerald-950/20 bg-white px-3 py-2.5 text-sm", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("w-full resize-y rounded-xl border border-emerald-950/20 bg-white px-3 py-3 text-sm", className)} {...props} />;
}
