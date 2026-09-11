
Directory for module image files
--------------------------------

You can put here the .png files of your module:


If the picto of your module is an image (property $picto has been set to 'timeflow.png@timeflow', you can put into this
directory a .png file called *object_timeflow.png* (16x16 or 32x32 pixels)


If the picto of an object is an image (property $picto of the object.class.php has been set to 'myobject.png@timeflow', then you can put into this
directory a .png file called *object_myobject.png* (16x16 or 32x32 pixels)

---

## TimeFlow-specific: object_timeflow.png

`object_timeflow.png` — cyan (`#08ADC7`), **actively used**. This is the
picto Dolibarr resolves for
`core/triggers/interface_99_modTimeFlow_TimeFlowTriggers.class.php`'s
`$this->picto = 'timeflow@timeflow'`, shown on the native, core
`admin/triggers.php` page. That page is always rendered in Dolibarr's
light theme regardless of any dark-mode setting this module's own pages
apply — the icon was recoloured from an earlier white/transparent version
(which was invisible there, confirmed on a real installation) to this
cyan, sampled directly from `frontend/src/assets/timeflow-logo.png` (the
source of the built React logo asset) rather than chosen arbitrarily, to
stay visually consistent with the module's frontend identity. The module's
own `$this->picto` (`core/modules/modTimeFlow.class.php`) uses a Font
Awesome keyword (`fa-clock`) instead of this convention, for reasons
documented at length in that file — this PNG is consumed only by the
trigger's picto, nothing else.

A white/transparent variant of this icon existed briefly for a possible
future dark-background use case, but was removed once the cyan version
was validated as the definitive rendering — there is now a single active
file for this picto.
