// Crédito fijo en la esquina: GIF local en public/gifs/ele.gif.
export default function CreatorCredit() {
  return (
    <aside className="creator-credit" aria-label="Hecho por el ele">
      <span>Hecho por el ele <span aria-hidden="true">:P</span></span>
      <img src={`${import.meta.env.BASE_URL}gifs/eleemo.gif`} alt="" width="64" height="64" />
    </aside>
  );
}