let emptyDragImage: HTMLImageElement | null = null;

/**
 * Ascunde complet fantoma nativă de drag (un pixel transparent), pentru că avem deja
 * propriul nostru feedback vizual: elementul sursă devine semi-transparent (vezi
 * `markDragging`) și, când se ajunge deasupra tablei, previzualizarea colorată de pe
 * grid arată exact unde s-ar plasa avionul. Dacă am afișa în plus și o fantomă nativă
 * (fie ea și una desenată de noi, cu forma avionului), s-ar suprapune cu previzualizarea
 * de pe grid și ar da impresia de "două avioane".
 */
export function setEmptyDragImage(e: React.DragEvent) {
  if (!emptyDragImage && typeof Image !== "undefined") {
    emptyDragImage = new Image();
    emptyDragImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";
  }
  if (emptyDragImage) {
    e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
  }
}

/**
 * Marchează elementul sursă ca fiind "ridicat" (semi-transparent) cât timp e tras,
 * revenind la normal la finalul tragerii — singurul indiciu vizual la sursă, ca să nu
 * se dubleze cu previzualizarea de pe grid.
 */
export function markDragging(e: React.DragEvent) {
  const target = e.currentTarget as HTMLElement;
  target.style.opacity = "0.35";
  const reset = () => {
    target.style.opacity = "";
    target.removeEventListener("dragend", reset);
  };
  target.addEventListener("dragend", reset);
}
