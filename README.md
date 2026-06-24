
# Native Tree Tabs for Firefox

   A scirpt that extends the abilities of the native vertical tabs of Firefox.

<img width="190" height="375" alt="light" src="https://github.com/user-attachments/assets/be94570d-1f5a-4f4d-9715-af2078db748b" />
<img width="190" height="375" alt="colors" src="https://github.com/user-attachments/assets/966ebff1-02d9-4f66-b9aa-e225e61ff930" />
<img width="190" height="375" alt="workspace" src="https://github.com/user-attachments/assets/248885f6-f58f-4362-b038-4f0f695b51da" />
<img width="190" height="375" alt="hover" src="https://github.com/user-attachments/assets/5b81d95f-b24c-4118-8cb3-8161ac19e633" />

## Features
(click to expand)
<details>
<summary> <b> Fast&Lightweight </b> </summary>

 - Only extends the native tabs.
 - No extra resources.
</details >
<details>
<summary> <b> No interference with native features </b> </summary>
   
 - Tab Groups support
 - Split view support (Will act independent from tree structure)
 - Selecting and moving multiple tab with swift/ctrl + click is possible.
</details>
<details>
<summary> <b> Tab panels (Workspaces)</b></summary>

 - Organize tabs in Workspaces for even less clutter
 - Move tabs between panels from the tab context menu (right click menu)
 - Right click on the name of a panel to rename it
 - Drag panels inside the menu to reorder them
 - Middle click in the Panel Header to instantly open a new panel
</details>
<details>
<summary> <b> Expand on hover support</b></summary>

 - Just enable the expand sidebar on hover option in Firefox sidebar settings
</details>
<details>
<summary> <b> Middle click the close button to close the whole tree</b></summary>
</details>
<details>
<summary> <b> Collapse tree on favicon click</b></summary>
   
 - Hide unused trees to save space
 - Closing a collapsed tree parent tab, will close the whole tree
</details>
<details>
<summary> <b> Drag and drop support.</b></summary>

 - Drop on top of tab to set it as the parent
 - Drag next to tab to set as sibling
 - Drag between tabs to fit
 - Drag outside of tree
 - Children (descendants) follow parent tab
</details>
<details>
<summary> <b> Session Restore friendly*</b></summary>

 - Saves the tree structure and the Tab panels
 - *Enable the option to restore session from Firefox settings to not loose you organized structure and panels between restarts
</details>
<details>
<summary> <b> Customizable</b></summary>

 - Search for `treeTabs.` in `about:config`.
 - Change tab style and margins
 - Enable extra functionalities

**Optional:**
Domain based tab color, add you custom rules in the end of the CSS style in the file.
</details>
      

## Installation
- Turn on Vertical Tabs in Firefox
- Install a userchrome.js loader
  - An updated one is [fx-autoconfig by MrOtherGuy](https://github.com/MrOtherGuy/fx-autoconfig)
- Download the `NativeTreeTabs.uc.js` file from this repository
 and put it inside `chrome/JS/` folder in your Firefox profile.
- Restart Firefox
- Done!

For no conflicts, make sure no addons that manage tabs are enabled.

**Important:** You have to keep your  userchrome.js loader up to date with Firefox releases.

**Note:**
The following prefs are set by the script automatically

`browser.tabs.dragDrop.createGroup.enabled`
`browser.tabs.groups.smart.enabled`
`browser.tabs.selectOwnerOnClose`

