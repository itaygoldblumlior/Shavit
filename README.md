# Daily wardrobe

Device-only clothing wardrobe with an IndexedDB database and a kid-drawn face above clothing, without body lines. The main screen contains the outfit, Add clothes, a Wardrobe button, and an optional Jacket / outer layer toggle. Clicking shirts, pants, shoes, or a jacket cycles that category. The jacket appears beside the shirt without shifting the face or outfit, and scales to the available space. Clicking the face cycles happy, sad, surprised, sleepy, and cheeky moods. Enter and Space also activate the figure's controls. Demo garments appear until real pieces are added.

Wardrobe shows only uploaded pieces, with filters for shirts, pants, shoes, and jackets. Click a piece to wear it. Each three-dot menu lets you rename or remove the piece. Both changes save to IndexedDB. Removing a piece asks for confirmation.

Photos are trimmed to visible edges before display. Shirt hems align to the pants waist, and pant legs overlap the tops of shoes slightly to avoid gaps. Width is calibrated from the visible waist region; this is a stylized outfit preview, not a physical fit prediction.

## Run

In this directory, run `npm install`, then `npm run dev`. Open http://127.0.0.1:5173 in the same browser each time; storage is tied to that browser and address.

Photos are processed locally using IMG.LY background removal. The first use downloads model/runtime assets from IMG.LY. No clothing photos are uploaded. Processing speed and cutout quality depend on the device and photo. Model downloads can be cached, but fully offline first use is unsupported. The app crops transparent margins and saves PNG cutouts to IndexedDB. The upload dialog starts removal immediately when a photo is selected and prevents saving until it succeeds.

Clearing browser storage deletes the wardrobe. The Add clothes dialog supports shirts, pants, shoes, and jackets; it appears only when opened.

`npm run build` produces a static build. Serve it with `npm run preview`; opening index.html directly is unsupported. Keep the same origin to keep accessing the same wardrobe.

IMG.LY background-removal is AGPL-3.0; see its installed package license. This source is local and has not been deployed.
