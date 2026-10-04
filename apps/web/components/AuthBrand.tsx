type Props = {
  tag?: string;
};

/** Brand mark for auth / invite cards — keeps Mira visible above the form. */
export function AuthBrand({ tag }: Props) {
  return (
    <div className="auth-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="auth-brand-mark"
        src="/brand/mira-mark.svg"
        alt="Mira"
        width={40}
        height={40}
      />
      {tag ? <p className="tag">{tag}</p> : null}
    </div>
  );
}
