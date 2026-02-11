# Kiro Account Manager v1.2.7 Release Notes

Release Date: 2024-12-09

## UI Improvements

### Global Page Enhancements
- **Unified Page Header Design**: All pages now use gradient backgrounds + blur effects + themed titles
- **Unified Card Styles**: All cards have hover shadow effects and icon background frames
- **Color Theming**: Removed all hardcoded colors, using theme variables throughout to ensure consistency in dark/light modes and theme color switching

### New Custom UI Components
- **Toggle Switch Component**: Replaces native checkbox with smooth animations and theme color support
- **Select Dropdown Component**: Replaces native select with option descriptions, checkmarks, and theme color highlighting

### Enhanced Pages
- **Home Page (HomePage)**: Header gradient, statistics card hover effects, themed feature cards
- **Account Manager (AccountManager)**: Header gradient background and icons
- **Settings Page (SettingsPage)**: Header gradient, unified card icon styles, optimized check interval layout
- **Kiro Settings (KiroSettingsPage)**: Header gradient, Toggle switches, Select dropdowns, grouped notification settings
- **About Page (AboutPage)**: Header gradient, unified card icon styles, consistent feature list colors

## Feature Improvements

### OIDC Credential Batch Import
- **GitHub and Google Account Support**: Batch import now supports specifying account type via `provider` field
- **Automatic Authentication Method Detection**: Automatically sets correct `authMethod` (IdC/social) and `idp` based on provider
- **Updated Help Text**: Added GitHub/Google examples and documentation

### Batch Import JSON Format Example
```json
[
  {
    "refreshToken": "xxx",
    "clientId": "xxx",
    "clientSecret": "xxx",
    "provider": "BuilderId"
  },
  {
    "refreshToken": "yyy",
    "provider": "Github"
  },
  {
    "refreshToken": "zzz",
    "provider": "Google"
  }
]
```

## New Files

- `src/renderer/src/components/ui/Toggle.tsx` - Custom toggle switch component
- `src/renderer/src/components/ui/Select.tsx` - Custom dropdown select component

## Bug Fixes

- Fixed check interval dropdown layout issue on settings page
- Fixed inconsistent dropdown widths on Kiro settings page
- Unified width settings between Settings page and Kiro Settings page
