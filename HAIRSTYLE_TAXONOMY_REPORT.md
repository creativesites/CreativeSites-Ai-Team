# MYAVANA AI Strand Intelligence & Hair Media Taxonomy Report
**Document ID:** MYA-TAXONOMY-2026-V1  
**Project:** Mya AI Visual Recognition & Hair Care Concierge Engine  
**Author:** Hair Science Research & Digital Asset Curation Team  
**Date:** September 11, 2026  
**Catalog Reference:** `hair_media_catalog.json` (35 Verified High-Fidelity Assets)

---

## 1. Executive Summary & Mission Alignment

As the pioneering AI strand intelligence platform, **MYAVANA** is engineered to transform hair care through rigorous scientific data, personalized diagnostics, and algorithmic strand analysis. For "Mya"—our conversational AI Hair Care Concierge and Strand Scientist—to deliver clinically sound, empathetic, and culturally grounded advice, her multimodal vision models require high-fidelity training data.

Textured hair—encompassing Andre Walker Hair Types 3A through 4C—has historically suffered from algorithmic underrepresentation, diagnostic bias, and superficial classification. Most commercial computer vision datasets conflate 4A, 4B, and 4C hair textures or treat shrinkage as length deficit rather than an elastic mechanical property.

This report establishes the taxonomic architecture, scientific foundations, and legal provenance of the **35-asset core visual media catalog** (`hair_media_catalog.json`). Every asset has been curated exclusively from open-access scientific repositories (PubMed Central, Royal Society, PLOS), public domain cultural archives (US National Archives, Flickr Commons / Internet Archive), and Creative Commons (CC BY, CC BY-SA 3.0/4.0) scientific institutions (MUSE Science Museum).

---

## 2. Taxonomic Pillars & Structural Analysis

The catalog is architected around four distinct operational pillars:

```
                                  MYAVANA KNOWLEDGE BASE
                                             │
             ┌───────────────────────┬───────┴───────────────┬────────────────────────┐
             ▼                       ▼                       ▼                        ▼
       [PILLAR 1]              [PILLAR 2]              [PILLAR 3]               [PILLAR 4]
    Curl Pattern &          Microscopic &           Hairstyle Taxonomy       Step-by-Step
    Classification        Diagnostic Anatomy       & Protective Styles         Regimens
  (Type 1A through 4C)    (Cuticle, Cortex,       (Braids, Knots, Twists,   (Wash, Detangle,
                           SEM, Follicles)          Afros, Locs, Taper)       LOC, Nightcare)
```

---

### Pillar 1: Hair Type & Curl Pattern Classification (Andre Walker System 1A–4C)

The Andre Walker classification system provides a standardized commercial framework for curl topography. However, Mya expands Walker's subjective curl descriptions into quantitative geometric parameters:

| Hair Type | Geometric Morphology | Curvature Pattern | Visual Reference Diameter | Shrinkage Index | Moisture Challenge Profile |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1A–1C** | Circular cylinder | Zero curvature; linear | N/A (Straight) | 0% | Sebum over-travel; limp roots |
| **2A–2C** | Loose elliptical | Shallow to defined S-bends | Large waves | 0% – 10% | Mid-shaft frizz; volume imbalance |
| **3A** | Broad elliptical | Wide loops / spirals | Sidewalk chalk (~1.5 in) | 10% – 25% | Surface dehydration; canopy frizz |
| **3B** | Oval elliptical | Springy, bouncy ringlets | Sharpie marker (~0.5 in) | 20% – 35% | Cuticle lifting at curl bends |
| **3C** | Flattened oval | Tight corkscrew spirals | Pencil / Straw (~0.25 in) | 30% – 45% | Inter-strand tangling; dry ends |
| **4A** | Flattened ribbon | Miniature S-to-O spirals | Crochet needle (~0.12 in) | 50% – 60% | Rapid moisture evaporation |
| **4B** | Angular ribbon | Sharp zig-zag ("Z") crimps | Sharp acute angles | 65% – 75% | High friction; stress points at angles |
| **4C** | Micro-interlocked ribbon| Dense micro-coils / no uniform axis | Needle-point (<0.05 in) | 75% – 90%+ | Extreme shrinkage; lowest sebum glide |

#### Scientific Nuance: The Shrinkage Paradigm in Type 4 Hair
Type 4 hair (specifically 4C) exhibits shrinkage rates exceeding 75% to 90% of its true stretched length. This is not a pathology; it is an evolutionary adaptation providing structural cushioning and moisture microclimates around the scalp. In `hair_media_catalog.json` (Assets `media_curl_4c_macro_001` through `media_curl_4a_spiral_003`), Mya is seeded with photography demonstrating how curl definition emerges under hydration versus compaction in dry ambient states.

---

### Pillar 2: Microscopic & Diagnostic Strand Anatomy

The health and mechanical behavior of textured hair are dictated at the sub-micron scale. The catalog includes high-resolution Scanning Electron Microscopy (SEM) up to 10,000X magnification from the MUSE Science Museum and clinical dermatology literature:

#### 1. Cuticle Architecture & Porosity
The hair cuticle consists of 6 to 10 layers of overlapping flat keratin scales (epicuticle, exocuticle, endocuticle).
*   **Low Porosity (Assets `media_micro_cuticle_sem_5000x_010`):** Cuticle scales lie tightly compressed, imbricated, and sealed by the 18-methyleicosanoic acid (18-MEA) lipid membrane. Water droplets bead up; requires alkaline warmth or steam to lift scales for treatment.
*   **Medium / Normal Porosity (Assets `media_micro_cuticle_sem_2000x_009`):** Scales are evenly spaced with slight natural lifting at the margins, allowing moisture penetration and retention.
*   **High Porosity (Assets `media_micro_cuticle_sem_10000x_011` & `media_micro_cut_surface_4700x_016`):** Scales are chipped, raised, or abraded due to UV degradation, chemical relaxers, or excessive heat. Exposed cortical microfibrils lead to rapid moisture loss and protein leaching.

#### 2. Follicular Asymmetry & Biomechanics
Citing the landmark review by Cloete, Khumalo, and Ngoepe (*Proc. R. Soc. A*, PMC6894537; Asset `media_anat_curly_follicle_curvature_015`):
*   Straight hair originates from a vertically oriented, **circular follicle**, resulting in symmetrical radial extrusion of keratin.
*   Curly and coily hair originates from a retrocurved, **elliptical, hook-shaped follicle**. Keratin synthesis is asymmetric: the outer curve synthesizes paracortical cells with higher cystine cross-links, while the inner curve contains orthocortical cells. This mechanical differential forces the growing strand to twist into natural coils.

#### 3. Structural Damage & Scalp Pathology
*   **Trichoptilosis (Split Ends; Assets `media_micro_split_end_trichoptilosis_012`, `media_micro_cut_shaft_geometry_035`):** Longitudinal cleavage of the cortex following cuticle erosion. Demonstrates the critical necessity of sharp shears.
*   **Traction Alopecia (Asset `media_scalp_traction_alopecia_018`):** Mechanical stress along the hairline due to excessive braiding tension, resulting in perifollicular erythema and eventual permanent follicle miniaturization.
*   **Seborrheic Dermatitis vs. Dry Scalp (Asset `media_scalp_seborrheic_dermatitis_017`):** Distinguishing between *Malassezia* yeast-driven greasy scales requiring antimycotics versus simple epidermal dehydration.

---

### Pillar 3: Hairstyle Taxonomy & Protective Styling

Protective styling is a foundational pillar of textured hair health, designed to tuck away delicate ends and reduce manipulation. The catalog documents:

1.  **Bantu Knots (Nubian Knots; Asset `media_style_bantu_knots_019`):** Sectioned geometric coils wrapped into conical buns. Serves as both an autonomous style and the mechanical precursor to heatless "Bantu Knot-Out" curls.
2.  **Cornrows & Feed-in Braids (Assets `media_style_cornrows_traditional_020`, `media_style_cornrow_bun_021`):** Underhand scalp braiding that distributes weight evenly across follicular rows.
3.  **Box Braids (Asset `media_style_box_braids_022`):** Three-strand individual plaits partitioned into a grid; key training focus is on tension-free roots (knotless transitions).
4.  **Flat Twists (Asset `media_style_flat_twists_curls_023`):** Two-strand scalp rolls that exert 40% less tension on delicate temporal edges than three-strand plaits.
5.  **Twist-Outs & Natural Afro Silhouettes (Assets `media_style_twist_out_defined_024`, `media_style_afro_voluminous_025`, `media_style_twa_short_afro_026`):** Emphasizing volume expansion, curl clustering, and pick lifting at the root matrix.
6.  **Mature Locs (Asset `media_style_mature_locs_027`):** Consolidated hair groupings where naturally shed strands weave into a permanent cylindrical core.

---

### Pillar 4: Step-by-Step Regimen Demonstrations

Mya's algorithmic product and regimen recommendations must be paired with visual protocol guides:

*   **Cleansing & Scalp Stimulation (Asset `media_regimen_wash_cleansing_029`):** Focuses on fingertip pads displacing sebum rather than fingernails gouging the stratum corneum.
*   **Wet Detangling Protocol (Asset `media_regimen_detangling_wet_030`):** Demonstrating the bottom-up combing rule (ends to roots) exclusively on saturated hair lubricated with high-slip cationic surfactants.
*   **Conditioner Emulsion Matching (Asset `media_regimen_conditioning_products_031`):** Matching hydrolyzed wheat/silk proteins for high porosity hair and lightweight humectants (glycerin, aloe vera) for low porosity strands.
*   **Nighttime Protection (Asset `media_regimen_night_bonnet_protection_032`):** Friction reduction via high-slip silk/satin wraps to prevent cotton absorption of natural lipids.
*   **Surface Sebum & Oil Absorption (Assets `media_micro_oil_absorption_treatment_033`, `media_micro_oily_sebum_buildup_034`):** Microscopic justification for the LOC/LCO method (Liquid, Oil, Cream).

---

## 3. Legal Compliance & Rights Clearance Matrix

All 35 assets cataloged in `hair_media_catalog.json` adhere strictly to permissive licensing requirements:

1.  **Creative Commons Attribution (CC BY 4.0 / CC BY-SA 3.0 & 4.0):** Requires attribution to the originating creator or scientific institution (MUSE Trento, Augustus Binu, Sven Sebastian Sajak, Royal Society). Permissible for commercial and educational use.
2.  **Public Domain (PDM / CC0 / US Government Work):** Federal works by Pete Souza (Executive Office of the President) and John H. White (US National Archives DOCUMERICA) are free of copyright restrictions under Title 17, Section 105 of the United States Code.
3.  **Open-Access Scientific Biomedical Research (PMC / PLOS):** Openly distributed under CC BY licenses permitting adaptation, visual card embedding, and AI model ingestion.
4.  **Zero Proprietary Infringement:** Zero copyrighted stock agency photos (Getty, Shutterstock, Adobe Stock) or unverified social media captures were included.

---

## 4. Integration into Mya AI Strand Intelligence

The structured metadata in `hair_media_catalog.json` will be directly consumed by the MYAVANA platform through three core interfaces:

1.  **Visual Generative UI Cards:** When a client completes their strand analysis or asks Mya about their hair type, Mya dynamically surfaces high-resolution cards displaying macro curl patterns and SEM cuticle states matching their diagnosis.
2.  **Computer Vision Benchmark Training:** Training localized image classification models to detect curl cluster diameter, curl retraction/shrinkage ratios, and scalp flaking patterns.
3.  **Customer 360 & Operator Console:** Enabling human trichologists and customer service operators in the MYAVANA dashboard to reference identical microscopic ground truths when reviewing client hair kits.

---

*Report certified by MYAVANA Hair Science & Multi-Agent Architecture Team.*
