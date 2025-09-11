"use client";
import { X, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function ArgsPanel({
  title,
  namespace,
  args,
  values,
  onChange,
  onClose,
}: {
  title: string;
  namespace?: string;
  args: { name: string; description?: string; required?: boolean; placeholder?: string }[];
  values: Record<string, string>;
  onChange: (k: string, v: string) => void;
  onClose: () => void;
}) {
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const requiredMissing = args.some(a => a.required && !((values[a.name] ?? "").trim().length));
  const filledCount = args.filter(a => (values[a.name] ?? "").trim().length > 0).length;
  const requiredCount = args.filter(a => a.required).length;
  const completionPercentage = args.length > 0 ? Math.round((filledCount / args.length) * 100) : 0;
  
  return (
    <div className="mt-3 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-orange-50/60 backdrop-blur-xl p-4 shadow-xl animate-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-bold text-amber-900">Parameters</div>
            <div className="px-2 py-0.5 bg-amber-200/60 text-amber-800 text-xs font-medium rounded-full">
              {filledCount}/{args.length} filled
            </div>
          </div>
          <div className="text-xs text-amber-700 font-medium">
            {title}{namespace ? ` · ${namespace}` : ''}
          </div>
          
          {/* Progress bar */}
          <div className="mt-2 w-full bg-amber-100 rounded-full h-1.5 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-500 ease-out"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          
          {/* Status message */}
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {requiredMissing ? (
              <>
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-red-600 font-medium">
                  {args.filter(a => a.required && !(values[a.name] ?? "").trim()).length} required field{args.filter(a => a.required && !(values[a.name] ?? "").trim()).length !== 1 ? 's' : ''} missing
                </span>
              </>
            ) : requiredCount > 0 ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="text-green-600 font-medium">All required fields completed</span>
              </>
            ) : (
              <span className="text-amber-600">Optional parameters</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-amber-200/60 transition-colors duration-200 text-amber-700 hover:text-amber-900"
          aria-label="Close parameters"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      {/* Form fields */}
      <div className="grid gap-3">
        {args.map((a) => {
          const hasValue = (values[a.name] ?? "").trim().length > 0;
          const isFocused = focusedField === a.name;
          const isEmpty = !hasValue;
          const isRequired = a.required;
          
          return (
            <div key={a.name} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                  {a.name}
                  {isRequired && (
                    <span className="text-red-500 text-xs">*</span>
                  )}
                  {a.description && (
                    <div className="group relative">
                      <HelpCircle className="w-3 h-3 text-amber-600 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                        {a.description}
                        <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                      </div>
                    </div>
                  )}
                </label>
                {hasValue && (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                )}
              </div>
              
              <input
                className={cn(
                  "w-full rounded-lg border-2 px-3 py-2 text-sm transition-all duration-200 bg-white/80 backdrop-blur-sm",
                  isFocused && "border-amber-400 shadow-lg shadow-amber-100",
                  !isFocused && hasValue && "border-green-300 bg-green-50/50",
                  !isFocused && isEmpty && isRequired && "border-red-300 bg-red-50/30",
                  !isFocused && !hasValue && !isRequired && "border-amber-200 hover:border-amber-300"
                )}
                placeholder={a.placeholder || a.description || `Enter ${a.name.toLowerCase()}...`}
                value={values[a.name] ?? ""}
                onChange={(e) => onChange(a.name, e.target.value)}
                onFocus={() => setFocusedField(a.name)}
                onBlur={() => setFocusedField(null)}
                required={isRequired}
              />
              
              {isEmpty && isRequired && !isFocused && (
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="w-3 h-3" />
                  <span>This field is required</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Footer help text */}
      <div className="mt-4 pt-3 border-t border-amber-200/60 text-xs text-amber-700">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-3 h-3" />
          <span>Fill the parameters above, then send your message to execute the prompt</span>
        </div>
      </div>
    </div>
  );
}

