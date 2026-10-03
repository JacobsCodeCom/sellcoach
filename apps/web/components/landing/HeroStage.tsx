const STEPS = [
  { id: "capture", label: "Record anyone", detail: "Seniors, mids, juniors at work" },
  { id: "lessons", label: "Compare methods", detail: "Fastest way becomes the lesson" },
  { id: "roadmap", label: "Match by role & level", detail: "New hires to mid-level people" },
  { id: "guide", label: "Guide on the job", detail: "Hints toward the better way" },
];

export function HeroStage() {
  return (
    <div className="hero-stage">
      <div className="hero-stage-glow" />
      <div className="hero-stage-frame">
        <div className="hero-stage-chrome">
          <span />
          <span />
          <span />
          <em>Mira · product loop</em>
        </div>

        <div className="hero-video">
          <div className="hero-video-desk">
            <div className="hero-video-toolbar">
              <strong>Workspace</strong>
              <span>Ben · Mid dispatcher</span>
            </div>

            <div className="hero-loop-stack">
              <div className="hero-loop-block" data-tone="capture">
                <span className="hero-loop-label">
                  <i /> Senior capture · Anna
                </span>
                <p>“I batch every confirmation in one template on Thursday.”</p>
              </div>

              <div className="hero-loop-block" data-tone="lesson">
                <span className="hero-loop-label">Best method · promoted</span>
                <strong>Batch template</strong>
                <p>3× faster than calling carriers one by one, with the same accuracy.</p>
              </div>

              <div className="hero-loop-block" data-tone="roadmap">
                <span className="hero-loop-label">Ben’s path · learned from seniors</span>
                <ul className="hero-loop-road">
                  <li data-state="active">
                    <em>1</em>
                    <span>Batch template confirmations</span>
                    <b>guiding</b>
                  </li>
                  <li data-state="locked">
                    <em>2</em>
                    <span>Never Friday for that account</span>
                    <b>next</b>
                  </li>
                </ul>
              </div>
            </div>

            <div className="hero-video-tip">
              <span>Hint</span>
              Anna does this in one template, about 3× faster
            </div>
          </div>

          <aside className="hero-video-side">
            <p className="hero-stage-kicker">What Mira does</p>
            <ol className="proof-steps">
              {STEPS.map((item, index) => (
                <li key={item.id} data-state={index === STEPS.length - 1 ? "active" : "done"}>
                  <span className="proof-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <em>{item.detail}</em>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
