"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { HelpCircle, Keyboard, Hash, Zap, Info, BookOpen, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  disabled?: boolean;
}

export function Tooltip({ 
  content, 
  children, 
  placement = 'top',
  className,
  disabled = false 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    let x = 0, y = 0;

    switch (placement) {
      case 'top':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        y = triggerRect.top - tooltipRect.height - 8;
        break;
      case 'bottom':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        y = triggerRect.bottom + 8;
        break;
      case 'left':
        x = triggerRect.left - tooltipRect.width - 8;
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        x = triggerRect.right + 8;
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
    }

    // Adjust for viewport boundaries
    x = Math.max(8, Math.min(x, viewport.width - tooltipRect.width - 8));
    y = Math.max(8, Math.min(y, viewport.height - tooltipRect.height - 8));

    setPosition({ x, y });
  }, [placement]);

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      const handleScroll = () => updatePosition();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
      };
    }
  }, [isVisible, placement, updatePosition]);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="inline-block"
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            "fixed z-50 px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg shadow-xl animate-in fade-in-0 zoom-in-95 duration-150",
            className
          )}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          {content}
          <div
            className={cn(
              "absolute w-2 h-2 bg-gray-900 rotate-45",
              placement === 'top' && "bottom-[-4px] left-1/2 transform -translate-x-1/2",
              placement === 'bottom' && "top-[-4px] left-1/2 transform -translate-x-1/2", 
              placement === 'left' && "right-[-4px] top-1/2 transform -translate-y-1/2",
              placement === 'right' && "left-[-4px] top-1/2 transform -translate-y-1/2"
            )}
          />
        </div>
      )}
    </>
  );
}

export function PromptHelpPanel({ 
  isOpen, 
  onClose, 
  className 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  className?: string; 
}) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '/', description: 'Open slash commands menu' },
    { key: '↑↓', description: 'Navigate through prompts' },
    { key: 'Enter', description: 'Select highlighted prompt' },
    { key: 'Tab', description: 'Select prompt (alternative)' },
    { key: 'Esc', description: 'Close menu or parameters' },
  ];

  const features = [
    {
      icon: <Hash className="w-4 h-4 text-blue-500" />,
      title: 'Slash Commands',
      description: 'Type / to browse commands; MCP prompts use /mcp.<server>.<prompt> format'
    },
    {
      icon: <Zap className="w-4 h-4 text-green-500" />,
      title: 'Smart Search',
      description: 'Search by server, trigger, title, or description with fuzzy matching'
    },
    {
      icon: <Info className="w-4 h-4 text-purple-500" />,
      title: 'Parameter Forms',
      description: 'Interactive forms for prompts with required or optional parameters'
    },
    {
      icon: <BookOpen className="w-4 h-4 text-orange-500" />,
      title: 'Live Preview',
      description: 'Preview prompt templates and parameters before execution'
    }
  ];

  return (
    <div className={cn(
      "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200",
      className
    )}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-300">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                MCP Prompt System Help
              </h2>
              <p className="text-sm text-gray-600">
                Learn how to use slash commands and MCP server prompts effectively
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg transition-colors"
              aria-label="Close help"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* Features Section */}
          <div className="px-6 py-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Features</h3>
            <div className="grid gap-4">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 mt-0.5">
                    {feature.icon}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 mb-1">
                      {feature.title}
                    </div>
                    <div className="text-sm text-gray-600">
                      {feature.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="px-6 py-5 border-t border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              Keyboard Shortcuts
            </h3>
            <div className="space-y-3">
              {shortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-600">{shortcut.description}</div>
                  <div className="flex items-center gap-1">
                    {shortcut.key.split('').map((key, keyIndex) => (
                      <kbd 
                        key={keyIndex}
                        className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-200 border border-gray-300 rounded shadow-sm"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Usage Guide */}
          <div className="px-6 py-5 border-t border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Use</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-medium text-gray-900">Start with a slash</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Type <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">/</kbd> in the chat input to open the prompt menu
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-medium text-gray-900">Search and select</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Continue typing to filter prompts, then use arrow keys to navigate and Enter to select
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="font-medium text-gray-900">Fill parameters</div>
                  <div className="text-sm text-gray-600 mt-1">
                    If the prompt has parameters, fill out the form that appears below the chat input
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-medium text-gray-900">Send your message</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Add your own message context and send to execute the prompt
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span>MCP Prompt System</span>
            </div>
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              <span>Got it!</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick help button component
export function PromptHelpButton({ 
  onClick, 
  className 
}: { 
  onClick: () => void; 
  className?: string; 
}) {
  return (
    <Tooltip content="Open help guide for slash commands and MCP prompts">
      <button
        onClick={onClick}
        className={cn(
          "p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200",
          className
        )}
        aria-label="Open help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
    </Tooltip>
  );
}
