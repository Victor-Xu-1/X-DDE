import type { Language } from "../types";
import type { ChainDisplay } from "./chain-visibility";
import "./chain-controls.css";

export function ChainControls({
  language,
  chains,
  hidden,
  onDisplay,
  onFocus,
}: {
  language: Language;
  chains: string[];
  hidden: string[];
  onDisplay(value: ChainDisplay): void;
  onFocus(chain: string): void;
}) {
  const zh = language === "zh";
  return (
    <details className="viewer-chain-menu">
      <summary>
        {zh ? "链" : "Chains"} {chains.length - hidden.length} / {chains.length}
      </summary>
      <div
        className="viewer-chain-list"
        role="group"
        aria-label={zh ? "链显示" : "Chain visibility"}
      >
        {chains.map((chain) => {
          const label = chain || (zh ? "未命名" : "Unnamed");
          return (
            <div key={chain}>
              <label>
                <input
                  type="checkbox"
                  checked={!hidden.includes(chain)}
                  onChange={(event) =>
                    onDisplay({
                      action: event.target.checked ? "show" : "hide",
                      chain,
                    })
                  }
                />
                {zh ? "显示链 " : "Show chain "}
                {label}
              </label>
              <button
                type="button"
                onClick={() => onFocus(chain)}
                aria-label={(zh ? "定位链 " : "Focus chain ") + label}
              >
                {zh ? "定位" : "Focus"}
              </button>
              <button
                type="button"
                onClick={() => onDisplay({ action: "only", chain })}
                aria-label={(zh ? "只显示链 " : "Show only chain ") + label}
              >
                {zh ? "仅此链" : "Only"}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onDisplay({ action: "all" })}
          disabled={hidden.length === 0}
        >
          {zh ? "显示全部链" : "Show all chains"}
        </button>
      </div>
    </details>
  );
}
