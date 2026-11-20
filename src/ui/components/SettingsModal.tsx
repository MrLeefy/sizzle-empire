import React, { useState } from 'react';
import type { GameController } from '@/engine/GameController';
import type { BuyMode } from '@/types/game';
import {
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AMBIENT_VOLUME,
  DEFAULT_SFX_VOLUME,
} from '@/engine/persistence/saveSchema';
import { CloseIcon, MusicNoteIcon, SettingsIcon, SpeakerIcon } from './CartoonIcons';

interface SettingsModalProps {
  controller: GameController;
  onClose: (silent?: boolean) => void;
  onVisualSettingsChange?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  controller,
  onClose,
  onVisualSettingsChange,
}) => {
  const save = controller.save;
  const s = save.settings;
  const [nameDraft, setNameDraft] = useState(save.social.displayName);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const sfxVolume = s.sfxVolume ?? DEFAULT_SFX_VOLUME;
  const ambientEnabled = s.ambientEnabled ?? DEFAULT_AMBIENT_ENABLED;
  const ambientVolume = s.ambientVolume ?? DEFAULT_AMBIENT_VOLUME;
  const cameraZoom =
    typeof s.cameraZoom === 'number' && Number.isFinite(s.cameraZoom)
      ? Math.min(1.4, Math.max(0.75, s.cameraZoom))
      : 1.0;

  const commitSfxPreview = (val: number) => {
    if (s.soundEnabled && val > 0) {
      controller.playUiSound('tap');
    }
  };

  const commitZoomChange = () => {
    onVisualSettingsChange?.();
    controller.playUiSound('tap');
  };

  return (
    <div
      className="sheet-backdrop modal-center"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">
            <SettingsIcon size={22} />
            <span>Settings &amp; Save Data</span>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={() => onClose()}
            aria-label="Close settings"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-body">
          {/* Chef Name */}
          <div className="item-card-col">
            <strong className="card-title text-ink">Chef Profile Name</strong>
            <div className="row-gap">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={20}
                placeholder="Chef Name"
                aria-label="Chef Profile Name"
                className="cartoon-input flex-1"
              />
              <button
                type="button"
                className="pill-btn blue sm"
                onClick={() => {
                  if (nameDraft.trim().length >= 2) {
                    controller.updateDisplayName(nameDraft);
                    controller.playUiSound('tap');
                    controller.pushToast('Chef name updated!', 'info');
                  } else {
                    controller.playUiSound('error');
                    controller.pushToast('Name must be at least 2 characters.', 'warning');
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>

          {/* Audio Controls: SFX, SFX Volume, Cozy Bistro Music, Ambient Volume, Haptics */}
          <div className="item-card-col">
            <div className="row-between">
              <div className="row-center-tight">
                <SpeakerIcon size={20} muted={!s.soundEnabled} />
                <div>
                  <strong className="card-title text-ink">Sound Effects</strong>
                  <div className="card-sub text-muted">Kitchen sizzles, chimes &amp; UI pops</div>
                </div>
              </div>
              <button
                type="button"
                aria-pressed={s.soundEnabled}
                className={s.soundEnabled ? 'pill-btn sm' : 'pill-btn ghost sm'}
                onClick={() => {
                  const next = !s.soundEnabled;
                  controller.updateSettings({ soundEnabled: next });
                  if (next) controller.playUiSound('tap');
                }}
              >
                {s.soundEnabled ? 'SFX On' : 'SFX Off'}
              </button>
            </div>

            <div className={`settings-slider-row ${!s.soundEnabled ? 'slider-dimmed' : ''}`}>
              <span className="text-sm text-muted font-bold">SFX Volume</span>
              <input
                type="range"
                aria-label="SFX Volume"
                min={0}
                max={100}
                step={5}
                value={Math.round(sfxVolume * 100)}
                className="cartoon-range flex-1"
                onChange={(e) =>
                  controller.updateSettings({ sfxVolume: Number(e.target.value) / 100 })
                }
                onPointerUp={(e) => commitSfxPreview(Number(e.currentTarget.value))}
                onKeyUp={(e) => commitSfxPreview(Number(e.currentTarget.value))}
              />
              <span className="settings-slider-val tabular-nums">
                {Math.round(sfxVolume * 100)}%
              </span>
            </div>
          </div>

          <div className="item-card-col">
            <div className="row-between">
              <div className="row-center-tight">
                <MusicNoteIcon size={20} muted={!ambientEnabled || !s.soundEnabled} />
                <div>
                  <strong className="card-title text-ink">Cozy Bistro Music</strong>
                  <div className="card-sub text-muted">Gentle marimba &amp; chord ambience</div>
                </div>
              </div>
              <button
                type="button"
                aria-pressed={ambientEnabled}
                className={ambientEnabled ? 'pill-btn sm' : 'pill-btn ghost sm'}
                onClick={() => {
                  controller.updateSettings({ ambientEnabled: !ambientEnabled });
                  controller.playUiSound('tap');
                }}
              >
                {ambientEnabled ? 'Music On' : 'Music Off'}
              </button>
            </div>

            <div
              className={`settings-slider-row ${!ambientEnabled || !s.soundEnabled ? 'slider-dimmed' : ''}`}
            >
              <span className="text-sm text-muted font-bold">Music Vol</span>
              <input
                type="range"
                aria-label="Ambient Music Volume"
                min={0}
                max={100}
                step={5}
                value={Math.round(ambientVolume * 100)}
                className="cartoon-range flex-1"
                onChange={(e) =>
                  controller.updateSettings({ ambientVolume: Number(e.target.value) / 100 })
                }
              />
              <span className="settings-slider-val tabular-nums">
                {Math.round(ambientVolume * 100)}%
              </span>
            </div>
          </div>

          {/* Camera Zoom */}
          <div className="item-card-col">
            <div className="row-between">
              <div>
                <strong className="card-title text-ink">Camera Zoom</strong>
                <div className="card-sub text-muted">Adjust 3D kitchen diorama framing</div>
              </div>
              <button
                type="button"
                className="pill-btn ghost xs"
                onClick={() => {
                  controller.updateSettings({ cameraZoom: 1.0 });
                  commitZoomChange();
                }}
              >
                1.0× Reset
              </button>
            </div>

            <div className="settings-slider-row">
              <span className="text-xs text-muted font-bold">0.75×</span>
              <input
                type="range"
                aria-label="Camera Zoom"
                min={0.75}
                max={1.4}
                step={0.05}
                value={Number(cameraZoom.toFixed(2))}
                className="cartoon-range flex-1"
                onChange={(e) =>
                  controller.updateSettings({ cameraZoom: Number(e.target.value) })
                }
                onPointerUp={commitZoomChange}
                onKeyUp={commitZoomChange}
              />
              <span className="settings-slider-val tabular-nums">{cameraZoom.toFixed(2)}×</span>
            </div>
          </div>

          {/* Haptics */}
          <div className="item-card">
            <div>
              <strong className="card-title text-ink">Tactile Haptics</strong>
              <div className="card-sub text-muted">Gentle vibrations on milestones &amp; upgrades</div>
            </div>
            <button
              type="button"
              aria-pressed={s.hapticsEnabled}
              className={s.hapticsEnabled ? 'pill-btn sm' : 'pill-btn ghost sm'}
              onClick={() => {
                controller.updateSettings({ hapticsEnabled: !s.hapticsEnabled });
                controller.playUiSound('tap');
              }}
            >
              {s.hapticsEnabled ? 'Vibe On' : 'Vibe Off'}
            </button>
          </div>

          {/* Performance & Display Settings */}
          <div className="item-card">
            <div>
              <strong className="card-title text-ink">Frame Rate Mode</strong>
              <div className="card-sub text-muted">60 FPS smooth or 30 FPS battery saver</div>
            </div>
            <button
              type="button"
              className="pill-btn blue sm"
              onClick={() => {
                controller.updateSettings({ targetFps: s.targetFps === 60 ? 30 : 60 });
                controller.playUiSound('tap');
              }}
            >
              {s.targetFps} FPS
            </button>
          </div>

          <div className="item-card">
            <div>
              <strong className="card-title text-ink">3D Graphics Quality</strong>
              <div className="card-sub text-muted">Controls shadows &amp; resolution scale</div>
            </div>
            <button
              type="button"
              className="pill-btn purple sm"
              onClick={() => {
                controller.updateSettings({
                  graphicsQuality:
                    s.graphicsQuality === 'high'
                      ? 'medium'
                      : s.graphicsQuality === 'medium'
                        ? 'low'
                        : 'high',
                });
                onVisualSettingsChange?.();
                controller.playUiSound('tap');
              }}
            >
              {s.graphicsQuality.toUpperCase()}
            </button>
          </div>

          <div className="item-card">
            <div>
              <strong className="card-title text-ink">Number Notation</strong>
              <div className="card-sub text-muted">Alphabetic (aa, ab) or Scientific (1.2e15)</div>
            </div>
            <button
              type="button"
              className="pill-btn ghost sm"
              onClick={() => {
                controller.updateSettings({
                  notation: s.notation === 'alphabetic' ? 'scientific' : 'alphabetic',
                });
                controller.playUiSound('tap');
              }}
            >
              {s.notation === 'alphabetic' ? 'K / M / aa' : '1.0e15'}
            </button>
          </div>

          <div className="item-card">
            <div>
              <strong className="card-title text-ink">Bulk Buy Step</strong>
              <div className="card-sub text-muted">Toggle ×50 or ×100 station button</div>
            </div>
            <button
              type="button"
              className="pill-btn ghost sm"
              onClick={() => {
                const nextStep: 50 | 100 = s.bulkStep === 50 ? 100 : 50;
                const nextBuyMode: BuyMode =
                  s.buyMode === '50' || s.buyMode === '100'
                    ? (String(nextStep) as BuyMode)
                    : s.buyMode;
                controller.updateSettings({ bulkStep: nextStep, buyMode: nextBuyMode });
                controller.playUiSound('tap');
              }}
            >
              ×{s.bulkStep}
            </button>
          </div>

          {/* Cloud Backup & Local Export/Import */}
          <div className="item-card-col">
            <strong className="card-title text-ink">
              Save Persistence (IndexedDB v{save.schemaVersion})
            </strong>
            <div className="btn-row">
              <button
                type="button"
                className="pill-btn blue sm"
                onClick={async () => {
                  const res = await controller.socialClient.uploadCloudBackup(save);
                  controller.playUiSound(res.ok ? 'tap' : 'error');
                  controller.pushToast(res.message, res.ok ? 'reward' : 'warning');
                }}
              >
                Cloud Backup
              </button>
              <button
                type="button"
                className="pill-btn ghost sm"
                onClick={() => {
                  controller.playUiSound('tap');
                  const json = controller.exportSave();
                  void navigator.clipboard?.writeText(json).catch(() => {});
                  setImportText(json);
                  setShowImport(true);
                  controller.pushToast('Save JSON copied & ready below!', 'info');
                }}
              >
                Export / Import JSON
              </button>
              <button
                type="button"
                className="pill-btn danger sm"
                onClick={() => {
                  if (window.confirm('Reset all local progress and start City 1 fresh?')) {
                    controller.playUiSound('tap');
                    void controller.hardReset();
                    onClose(true);
                  }
                }}
              >
                Reset Save
              </button>
            </div>

            {showImport && (
              <div className="col-tight">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={4}
                  placeholder="Paste exported save JSON here..."
                  className="cartoon-textarea"
                />
                <button
                  type="button"
                  className="pill-btn gold sm"
                  onClick={async () => {
                    const ok = await controller.importSave(importText);
                    if (!ok) {
                      controller.pushToast('Invalid or corrupted save JSON.', 'warning');
                    } else {
                      controller.playUiSound('unlock');
                      onClose(true);
                    }
                  }}
                >
                  Restore From JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
