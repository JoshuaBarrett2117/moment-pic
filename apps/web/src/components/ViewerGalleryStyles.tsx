import type { FC } from 'react';

type ViewerGalleryStylesProps = {
  showControls: boolean;
  showQualityPanel: boolean;
};

export const ViewerGalleryStyles: FC<ViewerGalleryStylesProps> = ({ showControls, showQualityPanel }) => (
  <style>{`
    .viewer-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .viewer-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .viewer-btn:active {
      transform: scale(0.95);
      background: rgba(255, 255, 255, 0.26);
    }
    .viewer-counter {
      position: fixed;
      top: calc(env(safe-area-inset-top) + 20px);
      left: 50%;
      transform: translateX(-50%) translateY(${showControls ? '-10px' : '0'});
      padding: 10px 20px;
      background: rgba(20, 22, 28, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 24px rgba(0, 0, 0, 0.35);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      backdrop-filter: blur(20px) saturate(150%);
      border-radius: 24px;
      color: white;
      font-size: 15px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      z-index: 20;
      opacity: ${showControls ? 1 : 0};
      transition: all 0.3s;
    }
    .viewer-close {
      position: fixed;
      top: calc(env(safe-area-inset-top) + 20px);
      right: 20px;
      transform: translateY(${showControls ? '-10px' : '0'});
      background: rgba(20, 22, 28, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 24px rgba(0, 0, 0, 0.35);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      backdrop-filter: blur(20px) saturate(150%);
      border-radius: 50%;
      color: white;
      cursor: pointer;
      transition: all 0.3s;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }
    .viewer-close:hover {
      background: rgba(40, 44, 54, 0.7);
    }
    .viewer-close:active {
      transform: scale(0.95);
    }
    .viewer-nav-btn {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(20, 22, 28, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 24px rgba(0, 0, 0, 0.35);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      backdrop-filter: blur(20px) saturate(150%);
      border-radius: 50%;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
      opacity: ${showControls ? 1 : 0};
    }
    .viewer-nav-btn.prev {
      left: 12px;
    }
    .viewer-nav-btn.next {
      right: 12px;
    }
    .viewer-nav-btn:hover {
      background: rgba(40, 44, 54, 0.7);
    }
    .viewer-nav-btn:active {
      transform: translateY(-50%) scale(0.95);
      background: rgba(50, 54, 66, 0.75);
    }
    .viewer-toolbar {
      position: fixed;
      bottom: calc(env(safe-area-inset-bottom) + 24px);
      left: 50%;
      transform: translateX(-50%) translateY(${showControls ? '-20px' : '0'});
      display: flex;
      gap: 12px;
      padding: 16px 24px;
      background: rgba(20, 22, 28, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 24px rgba(0, 0, 0, 0.35);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      backdrop-filter: blur(20px) saturate(150%);
      border-radius: 20px;
      z-index: 20;
      opacity: ${showControls ? 1 : 0};
      transition: all 0.3s;
    }
    .viewer-quality-panel {
      position: fixed;
      bottom: calc(env(safe-area-inset-bottom) + 112px);
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(18rem, calc(100vw - 2rem));
      padding: 14px;
      background: rgba(20, 22, 28, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 24px rgba(0, 0, 0, 0.35);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      backdrop-filter: blur(20px) saturate(150%);
      border-radius: 20px;
      z-index: 21;
      opacity: ${showControls && showQualityPanel ? 1 : 0};
      pointer-events: ${showControls && showQualityPanel ? 'auto' : 'none'};
      transition: all 0.2s;
    }
    .viewer-quality-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      padding: 12px 14px;
      border: none;
      border-radius: 14px;
      color: white;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
      text-align: left;
      transition: background 0.2s;
    }
    .viewer-quality-option:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .viewer-quality-option[data-active='true'] {
      background: var(--mp-accent-soft, rgba(138, 180, 255, 0.16));
      color: var(--mp-accent, #8ab4ff);
      box-shadow: inset 0 0 0 1px rgba(138, 180, 255, 0.35);
    }
    .viewer-image-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.3s;
    }
    .viewer-image {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      transition: transform 0.15s ease-out;
    }
    .viewer-image-placeholder {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      object-fit: contain;
      filter: blur(14px);
      pointer-events: none;
    }
    .viewer-image-placeholder ~ .viewer-loading {
      background: rgba(0, 0, 0, 0.15);
    }
    .viewer-loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
    }
    .viewer-loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: var(--mp-accent, #8ab4ff);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `}</style>
);
