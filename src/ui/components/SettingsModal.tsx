import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';

interface SettingsModalProps {
  controller: GameController;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ controller, onClose }) => {
  const save = controller.save;
  const s = save.settings;
  const [nameDraft, setNameDraft] = useState(save.social.displayName);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="sheet-backdrop modal-center" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">⚙️ Settings & Save Data</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="sheet-body">
          {/* Chef Name */}
          <div className="item-card-col">
            <strong style={{ fontSize: 12 }}>Chef Profile Name</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={20}
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: '#130e1d',
                  color: '#fff',
                }}
              />
              <button
                className="pill-btn blue"
                onClick={() => {
                  controller.updateDisplayName(nameDraft);
                  controller.pushToast('Chef name updated!', 'info');
                }}
              >
                Save
              </button>
            </div>
          </div>

          {/* Performance & Battery Saver */}
          <div className="item-card">
            <div>
              <strong style={{ fontSize: 13 }}>Frame Rate Mode</strong>
              <div style={{ fontSize: 11, color: '#b8b2d0' }}>60 FPS smooth or 30 FPS battery saver</div>
            </div>
            <button
              className="pill-btn blue"
              onClick={() => controller.updateSettings({ targetFps: s.targetFps === 60 ? 30 : 60 })}
            >
              {s.targetFps} FPS
            </button>
          </div>

          <div className="item-card">
            <div>
              <strong style={{ fontSize: 13 }}>3D Graphics Quality</strong>
              <div style={{ fontSize: 11, color: '#b8b2d0' }}>Controls shadows & resolution scale</div>
            </div>
            <button
              className="pill-btn purple"
              onClick={() =>
                controller.updateSettings({
                  graphicsQuality:
                    s.graphicsQuality === 'high'
                      ? 'medium'
                      : s.graphicsQuality === 'medium'
                        ? 'low'
                        : 'high',
                })
              }
            >
              {s.graphicsQuality.toUpperCase()}
            </button>
          </div>

          <div className="item-card">
            <div>
              <strong style={{ fontSize: 13 }}>Number Notation</strong>
              <div style={{ fontSize: 11, color: '#b8b2d0' }}>Alphabetic (aa, ab) or Scientific (1.2e15)</div>
            </div>
            <button
              className="pill-btn ghost"
              onClick={() =>
                controller.updateSettings({
                  notation: s.notation === 'alphabetic' ? 'scientific' : 'alphabetic',
                })
              }
            >
              {s.notation === 'alphabetic' ? 'K / M / aa' : '1.0e15'}
            </button>
          </div>

          <div className="item-card">
            <div>
              <strong style={{ fontSize: 13 }}>Bulk Buy Step</strong>
              <div style={{ fontSize: 11, color: '#b8b2d0' }}>Toggle ×50 or ×100 station button</div>
            </div>
            <button
              className="pill-btn ghost"
              onClick={() => controller.updateSettings({ bulkStep: s.bulkStep === 50 ? 100 : 50 })}
            >
              ×{s.bulkStep}
            </button>
          </div>

          <div className="item-card">
            <strong style={{ fontSize: 13 }}>Sound Effects & Haptics</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className={s.soundEnabled ? 'pill-btn' : 'pill-btn ghost'}
                onClick={() => controller.updateSettings({ soundEnabled: !s.soundEnabled })}
              >
                {s.soundEnabled ? 'SFX On' : 'SFX Off'}
              </button>
              <button
                className={s.hapticsEnabled ? 'pill-btn' : 'pill-btn ghost'}
                onClick={() => controller.updateSettings({ hapticsEnabled: !s.hapticsEnabled })}
              >
                {s.hapticsEnabled ? 'Vibe On' : 'Vibe Off'}
              </button>
            </div>
          </div>

          {/* Cloud Backup & Local Export/Import */}
          <div className="item-card-col">
            <strong style={{ fontSize: 12 }}>Save Persistence (IndexedDB v{save.schemaVersion})</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                className="pill-btn blue"
                onClick={async () => {
                  const res = await controller.socialClient.uploadCloudBackup(save);
                  controller.pushToast(res.message, res.ok ? 'reward' : 'warning');
                }}
              >
                Cloud Backup
              </button>
              <button
                className="pill-btn ghost"
                onClick={() => {
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
                className="pill-btn danger"
                onClick={() => {
                  if (window.confirm('Reset all local progress and start City 1 fresh?')) {
                    void controller.hardReset();
                    onClose();
                  }
                }}
              >
                Reset Save
              </button>
            </div>

            {showImport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={4}
                  placeholder="Paste exported save JSON here..."
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    padding: 8,
                    background: '#130e1d',
                    color: '#cbd5e1',
                    fontSize: 10,
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                />
                <button
                  className="pill-btn gold"
                  onClick={async () => {
                    const ok = await controller.importSave(importText);
                    if (!ok) controller.pushToast('Invalid or corrupted save JSON.', 'warning');
                    else onClose();
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
