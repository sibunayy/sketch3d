import { useEffect, useRef, useState } from 'preact/hooks';
import { saveBlob } from '../../app/download';
import { meshForPrint } from '../../app/printMesh';
import type { Store } from '../../app/state';
import { applyPatch, scaleToy } from '../../core/doc/edit';
import { BUILD_MM } from '../../core/doc/types';
import type { PrintIssue, PrintReport } from '../../core/print/check';
import { checkPrintable, meshSize } from '../../core/print/check';
import type { PrintIssueCode } from '../../core/print/messages';
import { centreOnPlate, printDoc, writeBinaryStl } from '../../core/print/stl';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { copy } from '../copy';

const TEXT: Record<PrintIssueCode, { message: string; fix: string }> = {
  empty: { message: copy.printEmptyMessage, fix: copy.printEmptyFix },
  'only-cuts': { message: copy.printOnlyCutsMessage, fix: copy.printOnlyCutsFix },
  'too-big': { message: copy.printTooBigMessage, fix: copy.printTooBigFix },
  'too-thin': { message: copy.printTooThinMessage, fix: copy.printTooThinFix },
  floating: { message: copy.printFloatingMessage, fix: copy.printFloatingFix },
  'not-watertight': { message: copy.printNotWatertightMessage, fix: copy.printNotWatertightFix },
};

type Phase = { kind: 'checking' } | { kind: 'done'; report: PrintReport; stl: ArrayBuffer | null; size: { w: number; h: number; d: number } } | { kind: 'failed' };

/**
 * Save to print: builds the toy at print quality, checks it, and only offers the file if it is good.
 * Each problem comes with a plain explanation and a button that helps fix it.
 */
export function PrintSheet({ store, onClose }: { store: Store; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [flatBase, setFlatBase] = useState(true);
  const [round, setRound] = useState(0); // bumps to run the check again
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setPhase({ kind: 'checking' });
    const doc = printDoc(store.doc.value, { flatBase });
    (async () => {
      try {
        const empty = doc.parts.length === 0 || doc.parts.every((p) => p.cut);
        const mesh = empty
          ? { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), partIds: new Uint16Array(0) }
          : await meshForPrint(doc);
        const report = checkPrintable(doc, mesh);
        const stl = report.ok ? writeBinaryStl(centreOnPlate(mesh)) : null; // a file is only made for a toy that can print
        if (live.current) setPhase({ kind: 'done', report, stl, size: meshSize(mesh) });
      } catch {
        if (live.current) setPhase({ kind: 'failed' });
      }
    })();
    return () => {
      live.current = false;
    };
  }, [flatBase, round, store]);

  const rerun = () => setRound((n) => n + 1);
  const done = phase.kind === 'done' ? phase : null;

  const fix = (i: PrintIssue) => {
    const ids = i.partIds ?? [];
    switch (i.code) {
      case 'empty':
        store.tool.value = 'draw';
        onClose();
        break;
      case 'only-cuts':
        store.tool.value = 'shape:circle';
        onClose();
        break;
      case 'too-big': {
        const size = done?.size;
        const biggest = size ? Math.max(size.w, size.h, size.d) : BUILD_MM * 2;
        const k = Math.min(1, (BUILD_MM - 1) / biggest);
        if (store.commit('Make it fit', (d) => scaleToy(d, k))) {
          store.toast(copy.toastFitted);
          rerun();
        }
        break;
      }
      case 'floating':
        if (store.commit('Melt together', (d) => applyPatch(d, ids, { melt: true, blend: 8 }))) rerun();
        break;
      case 'not-watertight':
        rerun();
        break;
      default:
        store.select(ids);
        onClose();
    }
  };
  const fixLabel = (c: PrintIssueCode) =>
    c === 'empty' ? copy.btnStartDrawing : c === 'only-cuts' ? copy.btnAddShape : c === 'too-big' ? copy.btnMakeFit : c === 'floating' ? copy.btnMeltThem : c === 'not-watertight' ? copy.btnCheckAgain : copy.btnShowMe;

  return (
    <div class="printsheet" role="dialog" aria-label={copy.btnSaveToPrint}>
      <div class="mytoys-head">
        <h2>{copy.btnSaveToPrint}</h2>
        <Button label={copy.btnClose} onClick={onClose} />
      </div>

      {phase.kind === 'checking' && (
        <p class="hint" role="status" data-testid="print-checking">
          {copy.printChecking}
        </p>
      )}
      {phase.kind === 'failed' && (
        <>
          <p>{copy.printSaveFailed}</p>
          <Button label={copy.btnCheckAgain} onClick={rerun} />
        </>
      )}

      {done && done.report.issues.length > 0 && (
        <div data-testid="print-issues">
          <p>{copy.printProblems}</p>
          <ul class="issues">
            {done.report.issues.map((i) => (
              <li key={i.code} class="issue">
                <div>
                  <strong>{TEXT[i.code].message}</strong>
                  <div>{TEXT[i.code].fix}</div>
                  {i.detail && <small>{i.detail}</small>}
                </div>
                <Button label={fixLabel(i.code)} onClick={() => fix(i)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {done && done.report.ok && done.stl && (
        <div class="ready" data-testid="print-ready">
          <p>
            <strong>{copy.printReady}</strong>
          </p>
          <p>
            {copy.sizeIs}: {Math.round(done.size.w)} × {Math.round(done.size.h)} × {Math.round(done.size.d)} mm. {copy.sizeFits}
          </p>
          <div class="field">
            <strong>{copy.labelFlatBase}</strong>
            <Segmented<string>
              label={copy.labelFlatBase}
              value={flatBase ? 'yes' : 'no'}
              options={[
                { value: 'yes', label: copy.flatYes },
                { value: 'no', label: copy.flatNo },
              ]}
              onChange={(v) => setFlatBase(v === 'yes')}
            />
          </div>
          <Button
            label={copy.btnDownloadStl}
            icon="savebig"
            variant="primary"
            onClick={async () => {
              if (!done.stl) return;
              await saveBlob(new Blob([done.stl], { type: 'model/stl' }), 'sketch3d-toy.stl');
              store.toast(copy.printSaved);
            }}
          />
        </div>
      )}
    </div>
  );
}
