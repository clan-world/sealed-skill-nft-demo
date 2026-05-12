import type { VisualStep } from './steps.js';
import { shortHash } from '@sealed-skill/protocol';

export function TeePanel(props: { title: string; subtitle: string; steps: VisualStep[]; accent: string; publicKey?: string | undefined; measurement?: string | undefined }) {
  return (
    <section className="tee-panel" style={{ borderColor: props.accent }}>
      <div className="tee-heading">
        <div>
          <h3>{props.title}</h3>
          <p>{props.subtitle}</p>
        </div>
        <div className="tee-chip" style={{ background: props.accent }}>TEE</div>
      </div>
      <div className="tee-meta">
        <span>key {props.publicKey ? shortHash(props.publicKey.replace(/\s+/g, ''), 14) : 'not registered'}</span>
        <span>measurement {props.measurement ? shortHash(props.measurement, 14) : 'not registered'}</span>
      </div>
      <ol className="steps">
        {props.steps.map((step, i) => (
          <li key={step.label} className={`step ${step.state}`}>
            <span className="step-icon">{step.state === 'done' ? '✓' : step.state === 'running' ? '◌' : step.state === 'error' ? '!' : '·'}</span>
            <span>{i + 1}. {step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function InfoCard(props: { label: string; value?: string | undefined; hidden?: boolean | undefined; href?: string | undefined }) {
  const value = props.hidden ? 'hidden' : props.value || 'not yet';
  const content = props.href && props.value
    ? <a href={props.href} target="_blank" rel="noreferrer">{value}</a>
    : value;

  return (
    <div className="info-card">
      <span>{props.label}</span>
      <strong>{content}</strong>
    </div>
  );
}

export function StatusPill(props: { ok?: boolean; text: string }) {
  return <span className={`status-pill ${props.ok ? 'ok' : 'warn'}`}>{props.text}</span>;
}
