import { PixelAgent } from "@/components/OnboardingChat";

const R = 44;
const CIRC = 2 * Math.PI * R;

type Props = {
  state: "speaking" | "thinking" | "listening" | "waiting";
  /** 0..1: fills over the silence that counts as a pause. */
  ring?: number;
  /** Ring turns amber when a question is ready to go. */
  ready?: boolean;
  off?: boolean;
};

/** The agent face with a ring that fills as a pause builds up. */
export function ApprenticeOrb({ state, ring = 0, ready = false, off = false }: Props) {
  return (
    <div className={`apprentice-orb${off ? " apprentice-orb--off" : ""}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className="apprentice-orb-track" cx="50" cy="50" r={R} />
        <circle
          className={`apprentice-orb-ring${ready ? " apprentice-orb-ring--ready" : ""}`}
          cx="50"
          cy="50"
          r={R}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC - CIRC * Math.min(1, Math.max(0, ring))}
        />
      </svg>
      <PixelAgent state={off ? "waiting" : state} />
    </div>
  );
}
