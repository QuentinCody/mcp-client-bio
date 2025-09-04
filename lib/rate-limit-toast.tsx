"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Clock, Zap, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

interface RateLimitInfo {
  provider: string;
  model?: string;
  retryTime?: string;
  tokenInfo?: string;
  hasUpgradeInfo: boolean;
  retrySeconds?: number;
}

function parseRetrySeconds(retryTimeStr: string): number {
  const match = retryTimeStr.match(/(\d+)\s*(seconds?|minutes?)/i);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  return unit.startsWith('minute') ? value * 60 : value;
}

function RetryCountdown({ 
  initialSeconds, 
  onRetry, 
  onClose 
}: { 
  initialSeconds: number; 
  onRetry: () => void; 
  onClose: () => void; 
}) {
  const [seconds, setSeconds] = useState(initialSeconds);
  
  useEffect(() => {
    if (seconds <= 0) {
      onRetry();
      return;
    }
    
    const timer = setTimeout(() => {
      setSeconds(s => s - 1);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [seconds, onRetry]);
  
  const formatTime = (totalSeconds: number) => {
    if (totalSeconds <= 0) return "0s";
    if (totalSeconds < 60) return `${totalSeconds}s`;
    
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };
  
  return (
    <div className="flex items-center justify-between gap-3 mt-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock size={14} />
        <span>Retry in {formatTime(seconds)}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onClose}
        className="text-xs"
      >
        Dismiss
      </Button>
    </div>
  );
}

function parseRateLimitError(errorMessage: string): RateLimitInfo | null {
  // Check if this is a rate limit error
  if (!/rate limit/i.test(errorMessage)) return null;
  
  // Extract provider
  let provider = 'Unknown';
  if (/groq/i.test(errorMessage)) provider = 'Groq';
  else if (/openai/i.test(errorMessage)) provider = 'OpenAI';
  else if (/anthropic/i.test(errorMessage)) provider = 'Anthropic';
  else if (/google/i.test(errorMessage)) provider = 'Google';
  
  // Extract model
  const modelMatch = errorMessage.match(/\(([^)]+)\)/);
  const model = modelMatch ? modelMatch[1] : undefined;
  
  // Extract retry time
  const retryMatch = errorMessage.match(/try again in ([0-9.]+ (?:seconds?|minutes?))/i);
  const retryTime = retryMatch ? retryMatch[1] : undefined;
  
  // Extract token info
  const tokenMatch = errorMessage.match(/(\d+(?:,\d+)* tokens remaining)/i);
  const tokenInfo = tokenMatch ? tokenMatch[1] : undefined;
  
  // Check for upgrade info
  const hasUpgradeInfo = /upgrade/i.test(errorMessage) || /billing/i.test(errorMessage);
  
  // Calculate retry seconds
  let retrySeconds = 0;
  if (retryTime) {
    retrySeconds = parseRetrySeconds(retryTime);
  }
  
  return {
    provider,
    model,
    retryTime,
    tokenInfo,
    hasUpgradeInfo,
    retrySeconds
  };
}

export function showRateLimitToast(errorMessage: string, onRetry?: () => void) {
  const rateLimitInfo = parseRateLimitError(errorMessage);
  
  if (!rateLimitInfo) {
    // Fallback to regular error toast
    toast.error(errorMessage);
    return;
  }
  
  const toastId = `rate-limit-${Date.now()}`;
  
  toast.error(
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-destructive" />
        <span className="font-medium">Rate Limit Exceeded</span>
      </div>
      
      <div className="text-sm space-y-1">
        <div>
          <strong>{rateLimitInfo.provider}</strong>
          {rateLimitInfo.model && <span className="text-muted-foreground"> ({rateLimitInfo.model})</span>}
        </div>
        
        {rateLimitInfo.tokenInfo && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Zap size={12} />
            <span>{rateLimitInfo.tokenInfo}</span>
          </div>
        )}
        
        {rateLimitInfo.hasUpgradeInfo && (
          <div className="text-muted-foreground text-xs">
            Consider upgrading your account for higher limits
          </div>
        )}
      </div>
      
      {rateLimitInfo.retrySeconds && rateLimitInfo.retrySeconds > 0 && onRetry ? (
        <RetryCountdown
          initialSeconds={rateLimitInfo.retrySeconds}
          onRetry={() => {
            toast.dismiss(toastId);
            onRetry();
          }}
          onClose={() => toast.dismiss(toastId)}
        />
      ) : (
        <div className="flex justify-end mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.dismiss(toastId)}
            className="text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>,
    {
      id: toastId,
      duration: rateLimitInfo.retrySeconds ? (rateLimitInfo.retrySeconds + 5) * 1000 : 10000,
      position: "top-center",
    }
  );
}