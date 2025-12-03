import React from "react";
import {
  Download,
  Settings,
  Pin,
  UserCircle,
  Camera,
  Shirt,
  MousePointerClick,
} from "lucide-react";
import { InstructionStep } from "./types";

export const ZIP_FILE_NAME = "web-wardrobe-chrome-extension-v2.11.2.zip";
export const API_BASE_URL = "https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod";

export const STEPS: InstructionStep[] = [
  {
    id: 1,
    title: "Download & Extract",
    description: `Locate the "${ZIP_FILE_NAME}" file you downloaded. You must extract (unzip) this file before proceeding.`,
    icon: Download,
    imageAlt: "File explorer showing the zipped and unzipped folders",
    imageSrc: "/images/Gemini_Generated_Image_do3oizdo3oizdo3o.png",
    notes: [
      "Right-click the zip file and select 'Extract All' (Windows) or double-click it (Mac).",
      "Remember where you save the extracted folder.",
    ],
  },
  {
    id: 2,
    title: "Enable Developer Mode",
    description:
      "Open Google Chrome and navigate to the Extensions page. Toggle the 'Developer mode' switch in the top right corner.",
    icon: Settings,
    imageAlt: "Chrome extensions page with Developer Mode toggle highlighted",
    imageSrc: "/images/Screenshot 2025-11-30 at 13.41.53.png",
    notes: [
      "Type chrome://extensions in your address bar.",
      "Ensure the toggle turns blue.",
    ],
  },
  {
    id: 3,
    title: "Load Extension",
    description:
      "Click the 'Load unpacked' button that appeared in the top left. Select the FOLDER you extracted in Step 1.",
    icon: MousePointerClick,
    imageAlt: "Chrome extensions page showing Load Unpacked button",
    imageSrc: "/images/Screenshot 2025-11-30 at 13.47.21.png",
    notes: [
      "Do not select the zip file.",
      "Select the folder containing the manifest.json file.",
    ],
  },
  {
    id: 4,
    title: "Pin to Toolbar",
    description:
      "Click the puzzle piece icon (Extensions) in your Chrome toolbar. Find 'WebWardrobe' in the list and click the pushpin icon to pin it.",
    icon: Pin,
    imageAlt: "Chrome toolbar dropdown with WebWardrobe pin icon highlighted",
    imageSrc: "/images/Screenshot 2025-11-30 at 10.43.04.png",
    isImportant: true,
    notes: [
      "Optional but highly advised.",
      "Keeps the extension visible for quick access.",
    ],
  },
  {
    id: 5,
    title: "Sign In with Google",
    description:
      "Open the extension popup by clicking the WebWardrobe icon. Click the 'Sign in with Google' button to authenticate your account.",
    icon: UserCircle,
    imageAlt: "WebWardrobe popup window showing the Sign in with Google button",
    imageSrc: "/images/Screenshot 2025-11-30 at 11.30.38.png",
  },
  {
    id: 6,
    title: "Upload Your Selfie",
    description:
      "After signing in, upload your selfie photo. This will be used for virtual try-ons to see how clothes look on you.",
    icon: Camera,
    imageAlt: "Upload selfie screen in the extension popup",
    imageSrc: "/images/Screenshot 2025-11-30 at 11.32.17.png",
    notes: ["Ensure good lighting.", "Use a full-body photo for best results."],
  },
  {
    id: 7,
    title: "Try On Clothes",
    description:
      "Navigate to a clothing store website. Right-click on a product image you like and select your selfie to apply the virtual try-on.",
    icon: Shirt,
    imageAlt:
      "Context menu on a clothing site showing the WebWardrobe Try On option",
    imageSrc: "/images/Screenshot 2025-11-30 at 11.37.29.png",
    notes: [
      "You can select which selfie to use if you have multiple.",
      "Works on most major fashion retailer websites.",
    ],
  },
];
