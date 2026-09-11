
Directory for module image files
--------------------------------

You can put here the .png files of your module:


If the picto of your module is an image (property $picto has been set to 'timeflow.png@timeflow', you can put into this
directory a .png file called *object_timeflow.png* (16x16 or 32x32 pixels)


If the picto of an object is an image (property $picto of the object.class.php has been set to 'myobject.png@timeflow', then you can put into this
directory a .png file called *object_myobject.png* (16x16 or 32x32 pixels)

---

## TimeFlow-specific: object_timeflow.png vs object_timeflow_white.png

These two files are **not redundant** — do not delete either one thinking
it duplicates the other.

- **`object_timeflow.png`** — cyan (`#08ADC7`), **actively used**. This is
  the picto Dolibarr resolves for
  `core/triggers/interface_99_modTimeFlow_TimeFlowTriggers.class.php`'s
  `$this->picto = 'timeflow@timeflow'`, shown on the native, core
  `admin/triggers.php` page. That page is always rendered in Dolibarr's
  light theme regardless of any dark-mode setting this module's own pages
  apply — a white icon is invisible there (confirmed on a real
  installation: this is exactly why this file was recolored from white to
  cyan). The module's own `$this->picto` (`core/modules/modTimeFlow.class.php`)
  uses a Font Awesome keyword (`fa-clock`) instead of this convention, for
  reasons documented at length in that file — this PNG is consumed only by
  the trigger's picto, nothing else.
- **`object_timeflow_white.png`** — the original white/transparent
  version, kept for a **possible future use on a dark background** (not
  currently referenced by any code — grepped and confirmed at the time
  this file was split in two). If a future need arises to show the
  TimeFlow icon over a dark surface (e.g. a themed page this module fully
  controls, unlike the fixed-light-theme `admin/triggers.php`), this is
  the file to point `$picto` at instead of `object_timeflow.png`.

Both share the exact same shape and alpha mask (128×128, generated from
the same source art) — only the fill color differs. The cyan value was
sampled directly from `frontend/src/assets/timeflow-logo.png` (the source
of the built React logo asset) rather than chosen arbitrarily, to stay
visually consistent with the module's frontend identity.
