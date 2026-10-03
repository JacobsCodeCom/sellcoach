const EXAMPLES = [
  {
    title: "01 · Capture from everyone",
    caption:
      "Anyone who does the work can teach it. Mira records how each person actually handles the same task.",
    body: (
      <div className="scene scene-voices">
        <p className="scene-label">Task · Confirm weekly carrier bookings</p>
        <ul>
          <li>
            <span className="scene-avatar" data-level="senior">A</span>
            <div>
              <strong>
                Anna <em>Senior · 8 yrs</em>
              </strong>
              <span>“I batch every confirmation in one template on Thursday.”</span>
            </div>
          </li>
          <li>
            <span className="scene-avatar" data-level="mid">B</span>
            <div>
              <strong>
                Ben <em>Mid · 3 yrs</em>
              </strong>
              <span>“I call each carrier one by one to confirm.”</span>
            </div>
          </li>
        </ul>
        <div className="scene-rec on">
          <i />
          <span>Mic capture · 2 methods heard</span>
        </div>
      </div>
    ),
  },
  {
    title: "02 · Compare methods",
    caption:
      "Same task, different ways of doing it. Mira compares them and promotes the fastest one that still gets it right.",
    body: (
      <div className="scene scene-compare">
        <p className="scene-label">Same task · 2 methods</p>
        <ul>
          <li data-best="true">
            <div className="scene-compare-head">
              <strong>Batch template</strong>
              <span className="scene-badge">Promoted</span>
            </div>
            <span className="scene-compare-by">Anna · Senior</span>
            <div className="scene-bar-track">
              <i style={{ width: "33%" }} />
              <b>6 min</b>
            </div>
          </li>
          <li>
            <div className="scene-compare-head">
              <strong>Call one by one</strong>
            </div>
            <span className="scene-compare-by">Ben · Mid</span>
            <div className="scene-bar-track">
              <i style={{ width: "100%" }} />
              <b>18 min</b>
            </div>
          </li>
        </ul>
        <p className="scene-note">3× faster, same accuracy → becomes the team default</p>
      </div>
    ),
  },
  {
    title: "03 · Match by role & level",
    caption:
      "Lessons go to whoever needs them, from new hires to mid-level people learning from a senior.",
    body: (
      <div className="scene scene-match">
        <p className="scene-label">Who learns what</p>
        <ul>
          <li>
            <div>
              <strong>Sara</strong>
              <em>New hire · Dispatcher</em>
            </div>
            <span className="scene-arrow">←</span>
            <div>
              <strong>Batch template</strong>
              <em>from Anna · Senior</em>
            </div>
          </li>
          <li>
            <div>
              <strong>Ben</strong>
              <em>Mid · Dispatcher</em>
            </div>
            <span className="scene-arrow">←</span>
            <div>
              <strong>Batch template</strong>
              <em>from Anna · Senior</em>
            </div>
          </li>
          <li>
            <div>
              <strong>Leo</strong>
              <em>Junior · AP clerk</em>
            </div>
            <span className="scene-arrow">←</span>
            <div>
              <strong>3-way match shortcut</strong>
              <em>from Maya · Senior AP</em>
            </div>
          </li>
        </ul>
      </div>
    ),
  },
  {
    title: "04 · Guide on the job",
    caption:
      "While people work, Mira nudges them toward the better method at the moment it matters.",
    body: (
      <div className="scene scene-guide">
        <p className="scene-label">Ben · confirming bookings</p>
        <div className="scene-guide-desk">
          <div className="scene-row wide" />
          <div className="scene-row mid" />
          <div className="scene-row" />
        </div>
        <div className="scene-guide-hint">
          <span>Hint</span>
          Anna batches these in one template, about 3× faster. Want to try it?
        </div>
      </div>
    ),
  },
];

export function ExampleVideos() {
  return (
    <div className="example-videos">
      {EXAMPLES.map((example) => (
        <figure className="demo-player" key={example.title}>
          <figcaption>
            <strong>{example.title}</strong>
            <span>{example.caption}</span>
          </figcaption>
          <div className="demo-screen">
            <div className="demo-chrome">
              <span className="demo-dot" />
              <span className="demo-dot" />
              <span className="demo-dot" />
            </div>
            <div className="demo-stage">{example.body}</div>
          </div>
        </figure>
      ))}
    </div>
  );
}
