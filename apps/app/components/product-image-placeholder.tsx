/** Shown instead of a picture when a product has no photo: never a stand-in image. */
export function ProductImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      Image not available
    </div>
  );
}
