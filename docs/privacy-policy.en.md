# Privacy Policy - Clean Reload

Last updated: August 31, 2026

## Overview

"Clean Reload" is a browser extension that respects your privacy to the fullest.

## Data Collection

This extension does not collect, store, or transmit any personal information.

## Permissions Used

### activeTab
Used to access only the active tab when you click the toolbar icon. No background data access is performed.

### browsingData
Used to delete Service Worker registrations and the HTTP cache, and on Chrome to delete CacheStorage for the relevant origin. It never touches other data such as browsing history or cookies.

> On Firefox, due to differences in the browsingData API, Service Worker registrations are removed per the target tab's hostname and the HTTP cache is cleared for the whole browser. Firefox's browsingData API cannot delete CacheStorage (the DOM Cache API), so saved CacheStorage data remains. Browsing history, cookies, passwords, and other data are never accessed.

### contextMenus
Used to show the clean-reload-all-tabs and force-background-tabs-to-sleep commands when you right-click the toolbar icon. Nothing is added to the in-page context menu.

### tabs
Used by the clean-reload-all-tabs feature to read tab URLs and clear each origin's cache, and by the force-background-tabs-to-sleep feature to release inactive tabs from memory. Retrieved URL information is discarded after processing and is never stored or transmitted externally.

## External Communication

This extension performs no communication with external servers. All processing is completed within the browser.

## Remote Code

This extension does not load any code from external sources. All code is contained within the extension package.

## Contact

For privacy-related questions, please reach out via the Issues page of the GitHub repository.
