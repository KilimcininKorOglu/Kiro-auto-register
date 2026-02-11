# Kiro Account Manager v1.2.5 Changelog

**Release Date**: 2025-12-09

---

## Theme System Upgrade

### Theme Color Expansion
- Theme colors increased from **13 to 21**, providing more personalization options
- Colors are grouped by color family for easier selection:
  - **Blues**: Sky Blue, Indigo, Fresh Cyan, Clear Sky Blue, Teal
  - **Purple/Pink**: Elegant Purple, Violet, Magenta, Pink, Rose Red
  - **Warm Colors**: Passionate Red, Vibrant Orange, Amber Gold, Bright Yellow
  - **Greens**: Emerald, Grass Green, Lime
  - **Neutrals**: Slate Gray, Zinc Gray, Warm Gray, Neutral Gray

### Theme Selector Optimization
- Added **collapse/expand** functionality, showing current selected color when collapsed
- Click to expand the full theme selection panel
- Reduced page space usage for a cleaner interface

---

## Homepage Enhancements

### Quota Statistics Card
- Added **Quota Statistics** module that aggregates usage data from all valid accounts in real-time
- Displays:
  - Total quota
  - Used amount
  - Remaining quota
  - Usage percentage
- Visual progress bar with color changes based on usage rate:
  - Green: < 50%
  - Yellow: 50% - 80%
  - Red: > 80%

---

## Export Feature Upgrade

### Multi-Format Export Support
- Added export format selection dialog with 4 export formats:
  - **JSON**: Complete data, can be used for import/restore
  - **TXT**: Plain text format, easy to read
  - **CSV**: Excel-compatible format with Chinese support
  - **Clipboard**: Copy directly to clipboard

### Export Options
- JSON format allows choosing whether to include credential information (tokens and other sensitive data)
- Supports multi-select account export; exports only selected accounts when selection is active
- Settings page and account management page share the same export component

---

## Machine ID Management Optimization

### Current Machine ID Card
- Added **Last Modified Time** display, consistent with original machine ID backup layout

### Account Machine ID Management Dialog
- Added **Search Functionality** supporting search by email, nickname, or machine ID
- Displays friendly message when search returns no results

---

## Bug Fixes

- Fixed issue where some theme color switches were not working
- Completed CSS variable definitions for all new themes
- Fixed `applyTheme` function not including new theme class names

---

## Technical Improvements

- Refactored theme configuration to grouped structure for easier maintenance and extension
- Componentized export functionality to improve code reusability
- Optimized quota statistics using `useMemo` for better performance

---

**Full Version**: 1.2.5  
**Compatibility**: Windows / macOS / Linux
