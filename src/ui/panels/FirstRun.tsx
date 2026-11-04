import { useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { copy } from '../copy';

const DONE_KEY = 'sketch3d.guide.done';

/** True the first time the app is opened on this device. */
export function shouldShowGuide(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return !storage.getItem(DONE_KEY);
  } catch {
    return false; // if we cannot remember, do not nag
  }
}

export function markGuideDone(storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(DONE_KEY, '1');
  } catch {
    // nothing more to do
  }
}

const STEPS = [
  { title: copy.guideStep1Title, text: copy.guideStep1Text },
  { title: copy.guideStep2Title, text: copy.guideStep2Text },
  { title: copy.guideStep3Title, text: copy.guideStep3Text },
];

/** Three short steps, shown once and again whenever the child asks (the Help button). */
export function FirstRun({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const finish = () => {
    markGuideDone();
    onClose();
  };
  return (
    <div class="guide-backdrop">
      <div class="guide" role="dialog" aria-modal="true" aria-label={copy.guideTitle}>
        <p class="guide-count">
          {step + 1} / {STEPS.length}
        </p>
        <h2>{STEPS[step].title}</h2>
        <p class="guide-text">{STEPS[step].text}</p>
        <div class="row">
          {step > 0 && <Button label={copy.btnBack} onClick={() => setStep(step - 1)} />}
          {!last && <Button label={copy.btnNext} variant="primary" onClick={() => setStep(step + 1)} />}
          {last && <Button label={copy.btnStartMaking} variant="primary" onClick={finish} />}
          {!last && <Button label={copy.btnSkip} onClick={finish} />}
        </div>
      </div>
    </div>
  );
}
