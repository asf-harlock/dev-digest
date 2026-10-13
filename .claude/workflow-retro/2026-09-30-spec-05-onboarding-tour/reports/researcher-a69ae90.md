## Hand-back 1

## External research: aria-current and scroll-spy "On this page" TOC

### Findings
1. **Token choice: use `aria-current="true"`.** The WAI-ARIA 1.2 tokens are page, step, location, date, time, true and false.
   - `page` is for pagination or links to the current document.
   - `step` is for step indicators (wrong here).
   - `location` is defined as "the image that is visually highlighted as the current component of a flow chart". It is for a flow chart or map, not a TOC.
   - `true` is the generic "current item in a set" value. Unrecognised values fall back to `true` anyway.
   - Sara Soueidan uses `aria-current="true"` for scroll-spy anchors and says "for nested or in-page navigation links, the true value is sufficient".
   - The spec text does not name TOCs. So `true` is the best fit by elimination and by practitioner guidance, not by an explicit rule. `location` is a defensible alternative; `step` is wrong.
   - Mark only one link as current (spec: "SHOULD only mark one element"). Do not use `aria-selected` as a substitute.
   - MDN's page has no TOC guidance. My fetch tool suggested `page` for a TOC, but that was the tool's inference and I rejected it. `page` fits links to pages in a set, and GOV.UK uses it only for contents lists that span separate pages.
2. **Focus on click: rely on native anchor behaviour, with a fallback.**
   - Browsers already move the sequential-focus starting point to the fragment target when a link is followed. Focus itself moves only if the target is focusable.
   - USWDS does the extra step only for keyboard activation. On Enter it sets `tabindex=0` on the heading, calls `.focus()`, and resets `tabindex=-1` on blur (once). Mouse users keep focus on the TOC link.
   - So `tabindex="-1"` on the headings is the standard way to let them receive programmatic focus. If you call `.focus()` yourself, use `{preventScroll: true}` when you do your own smooth scroll (my suggestion, not from a source).
3. **USWDS in-page navigation behaviour (read from source, `packages/usa-in-page-navigation/src/index.js`):**
   - It uses IntersectionObserver with `root: null`, default `rootMargin "0px 0px 0px 0px"` and `threshold [1]`. Both are overridable via `data-root-margin` and `data-threshold`.
   - It observes a zero-size anchor element inserted at the start of each heading, not the whole section.
   - The active link gets a CSS class (`usa-current`). I found no `aria-current` in the source, so USWDS does not expose the state to assistive tech. That is a gap, not a pattern to copy.
   - Smooth scroll uses `window.scroll({behavior:"smooth"})`. The hash is updated with `history.pushState` only if it differs from the current hash.
   - I found no `prefers-reduced-motion` check in the JS. Any reduced-motion handling would have to be in CSS, which I did not check.
   - I found no guard against the active item changing during a smooth scroll.
4. **GOV.UK:** I found no scroll-spy in-page nav in the GOV.UK Design System. Its contents list is a static list of links. It sets `aria-current="page"` only when the list links to other pages, per the search summary; I did not fetch that page. The NHS and ONS table-of-contents components turned up in search, but I did not verify their scroll-spy behaviour.
5. **Practices with no authoritative source.** These are my suggestions and are unconfirmed, so treat them as engineering judgement.
   - **Observer setup:** use a `rootMargin` like `-10% 0px -80% 0px`, or offset it by your sticky header height. That makes a thin band near the top of the viewport decide the active section. Use `threshold: 0`, or a few thresholds if you need ratios. A threshold of 1 fails for tall sections, because they never reach 100% visibility.
   - **Flicker during smooth scroll:** on click, set the active item immediately and set a "programmatic scroll" flag. Ignore observer updates until `scrollend` fires, or until scroll position has been stable for about 100 ms as a fallback for Safari. Then resume.
   - **Hash updates:** use `history.replaceState` for scroll-spy updates, so Back does not step through every section. Use the native anchor navigation, which creates a history entry, or `pushState`, for deliberate clicks. USWDS uses `pushState` on clicks.
   - **Reduced motion:** check `matchMedia('(prefers-reduced-motion: reduce)')` and use `behavior:'auto'` if it matches. You can also do it in CSS with `scroll-behavior: smooth` inside `@media (prefers-reduced-motion: no-preference)`. If you rely on CSS and native anchors, the flag above still applies.

### Recommendation
- Use `<nav aria-label="On this page">` containing a list of `<a href="#id">` links.
- Set `aria-current="true"` on the one active link. Remove it from the others rather than setting `false`.
- Put `id` and `tabindex="-1"` on target headings, and use native anchor navigation.
- Add `scroll-margin-top` to the headings for any sticky header.
- Use IntersectionObserver with a top-band `rootMargin`, `replaceState` for spy-driven hash updates, reduced-motion-aware smooth scroll, and a click-lock until `scrollend`.
- Do not copy USWDS's class-only active state.

### Evidence
- "A `location` token used to indicate the image that is visually highlighted as the current component of a flow chart." and "Any value not included in the list of allowed values SHOULD be treated by assistive technologies as if the value true had been provided." and "Authors SHOULD only mark one element in a set of elements as current" — WAI-ARIA 1.2, aria-current (fetched from the raw spec HTML).
- "A `step` token used to indicate a link within a step indicator for a step-based process" — same section.
- "For nested or in-page navigation links, the true value is sufficient to indicate the current link within the group." and "you will … need to use JavaScript to add aria-current to the active anchor … otherwise you risk an instant WCAG 1.3.1 violation." — Sara Soueidan. The first is a paraphrase from my fetch tool's summary, not a verified verbatim quote. The second is also from the tool's summary.
- USWDS source: `const IN_PAGE_NAV_ROOT_MARGIN = "0px 0px 0px 0px"; const IN_PAGE_NAV_THRESHOLD = "1";`, `window.scroll({behavior:"smooth", …})`, `window.history.pushState(null, "", \`#${el.id}\`)`, `target.setAttribute("tabindex", 0); target.focus(); … blur → tabindex -1` (inside `handleEnterFromLink`). `grep -i aria-current` on the file returned only `CURRENT_CLASS` (a CSS class), so no `aria-current`. `grep -i reduce` returned nothing.

### References
- https://www.w3.org/TR/wai-aria-1.2/#aria-current
- https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current
- https://sarasoueidan.com/blog/css-scrollspy/
- https://designsystem.digital.gov/components/in-page-navigation/
- https://github.com/uswds/uswds/blob/develop/packages/usa-in-page-navigation/src/index.js
- https://components.publishing.service.gov.uk/component-guide/contents_list (seen in search results only)
- https://service-manual.nhs.uk/design-system/components/contents-list (seen in search results only)

### Could not find
- Any authoritative source that names `aria-current` for TOC or in-page nav (WAI-ARIA, APG and MDN don't, as far as I could see). The recommendation of `true` rests on elimination against the spec and on one practitioner source.
- An APG pattern for scroll-spy or TOC. I did not check APG directly.
- GOV.UK or NHS scroll-spy code. I did not verify that they have any.
- USWDS `prefers-reduced-motion` handling, which may be in its Sass, and any USWDS anti-flicker logic. I found neither in the JS.
- The IntersectionObserver `rootMargin` and `replaceState` practices in finding 5 have no primary source. They are my suggestions.