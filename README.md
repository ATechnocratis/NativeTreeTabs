
# Native Tree Tabs for Firefox

   Following the release of native vertical tabs for Firefox, add the ability to adopt a tree structure automatically.

<img width="190" height="375" alt="light" src="https://github.com/user-attachments/assets/be94570d-1f5a-4f4d-9715-af2078db748b" />
<img width="190" height="375" alt="colors" src="https://github.com/user-attachments/assets/966ebff1-02d9-4f66-b9aa-e225e61ff930" />
<img width="190" height="375" alt="workspace" src="https://github.com/user-attachments/assets/248885f6-f58f-4362-b038-4f0f695b51da" />
<img width="190" height="375" alt="hover" src="https://github.com/user-attachments/assets/5b81d95f-b24c-4118-8cb3-8161ac19e633" />

## Features
  - **Lightweight** 
     - Only extends the native tabs. No extra elements are created.
  - **No interference with native features**
     - What works on native tabs is still there
     - Tab Groups support
     - Split view support (Will act independent from tree structure)
     - Selecting and moving multiple tab with swift + click or ctrl + click is possible.
  - **Tab panels (Workspaces)** 
     - Organized tabs in Workspaces for even less clutter
  - **Expand on hover support**
      - Just enable the expand sidebar on hover option in Firefox sidebar settings.
  - **Middle click the close button to close the whole tree**
  - **Collapse tree on favicon click**
      - Closing a collapsed tree parent tab, will close the whole tree.
  - **Drag and drop support.**
    - Drop on top of tab to set it as the parent
    - Drag next to tab to set as sibling
    - Drag between tabs to fit
    - Drag outside of tree
    - Children (descendants) follow parent tab
  - **Session Restore friendly**
      - Saves the tree structure
  - **Customizable**
      - Search for `treeTabs.` in `about:config`.
      - Change tab style and margins
      - Change the script behavior
      - Enable extra functionalities

      


**Optional:**
Domain based tab color, add you custom rules in the end of the CSS style in the file.


## Installation
- Turn on Vertical Tabs in Firefox
- Install a userchrome.js loader
  - An updated one is [fx-autoconfig by MrOtherGuy](https://github.com/MrOtherGuy/fx-autoconfig)
- Download the NativeTreeTabs.uc.js file from this repo
 and put it inside `chrome/JS/` folder in your Firefox profile.
- Restart Firefox
- Done!

Make sure no addons that manage tabs are enabled.

**Important:** You have to keep your loader up to date with Firefox releases.
An ESR build is recommended for this reason.

**Note:**
The following prefs are set by the script automatically

`browser.tabs.dragDrop.createGroup.enabled`
`browser.tabs.groups.smart.enabled`
`browser.tabs.selectOwnerOnClose`
