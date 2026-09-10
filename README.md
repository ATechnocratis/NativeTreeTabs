
# Native Tree Tabs for Firefox

   A script that extends the native vertical tabs. Adding the ability to adopt tree-like structure automatically and more.


<img width="190" height="375" alt="light" src="https://github.com/user-attachments/assets/be94570d-1f5a-4f4d-9715-af2078db748b" />
<img width="190" height="375" alt="colors" src="https://github.com/user-attachments/assets/966ebff1-02d9-4f66-b9aa-e225e61ff930" />
<img width="190" height="375" alt="workspace" src="https://github.com/user-attachments/assets/248885f6-f58f-4362-b038-4f0f695b51da" />
<img width="190" height="375" alt="hover" src="https://github.com/user-attachments/assets/5b81d95f-b24c-4118-8cb3-8161ac19e633" />

## Features
(click to expand)
<details>
<summary> <b> Fast & Lightweight & Native </b> </summary>

 - Only extends the native tabs.
 - No extra resources.
 - Tab Groups support
 - Split views support
 - Keeps and extends the native tab context menu 
</details >
<details>
<summary> <b> Tab panels (Workspaces)</b></summary>

- Organize tabs in Workspaces for even less clutter
 - Left click the Panel Header to open the panel list
 - Drag the listed panels to reorder them
 - Middle click the Panel Header/button to instantly open a new panel
 - Scroll on the Panel header/button to switch betweens the panels
 - Right click on the header or a panel in the dropdown list to open a Panel Context Menu
 - Rename the panel, manage its tabs, expand/collapse its trees (`ctrl + click` to expand/collapse Tab Groups too) 
 - Move tabs between panels from the tab context menu (right click a tab)
 - Move a Tab Group in the Manage Group Popup(right click a Group label) or by multi-selecting all of its tabs
</details>
<details>
<summary> <b> Expand on hover support and more</b></summary>
<p>
   
  Just enable the expand sidebar on hover option in Firefox sidebar settings.
  
  Or enable the window size mode aware, Smart sidebar resizer in the script settings section.*
  With this the Sidebar will be full sized on maximized windows and collapsed at normal windows to prioritize browsed content
  *(Found at the bottom of customize sidebar settings)
</p>
</details>
<details>
<summary> <b> Middle click the close button to close the whole tree under a tab</b></summary>
</details>
<details>
<summary> <b> Collapse tree on favicon click</b></summary>
   
 - Hide unused trees to save space
 - A popup will be show on hover with the collapsed children which are also clickable for faster tab switching
 - Clicking the close button\middle click on a collapsed tree parent tab, will close the whole tree
 - Option to automatically collapse trees/groups in settings
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
<summary> <b> Keyboard shortcuts.</b></summary>

 - `Ctrl + Comma(,)` to switch to the next panel or `Ctrl + Shift + Comma(,)` for reverse order
 - `Ctrl + Alt + Comma(,)` to create a new panel
 - `Ctrl + Alt + Left/Right arrow` to change the tab indention level
 - `Ctrl + Alt + Up/Down arrow` to move the tab and change indention level
 - `Ctrl + Shift + F` to switch to previous active tab
- Modify/remove keyboard shortcuts on Sidebar Settings (Customize sidebar option)

</details>
<details>
<summary> <b> Multiple tab select</b></summary>

- Selecting multiple tabs with `shift/ctrl + click` is still possible (native FF feature)
- Added ability to right click hold and hover over tabs to multi-select them as action target.
</details>

<details>
<summary> <b> Organize with Nest tabs.</b></summary>

 - Right click a tab(s) and select `Nest tabs`
 - A new tree root will be created and all the selected tabs/trees will be under it
 - Nest tabs will collapsed/show the tree on click just like Tab Groups
 - Right click to rename them
</details>
<details>
<summary> <b> Session Restore friendly*</b></summary>

 - Saves the tree structure and the Tab panels
 - *Enable the option to restore session from Firefox settings to not loose you organized structure and panels between restarts
</details>
<details>
<summary> <b>Settings and Extras</b></summary>

 - [Open the Customize Sidebar settings](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs#w_turn-on-vertical-tabs:~:text=Customize%20sidebar%20and%20vertical%20tabs,-After) and find the Tree Tabs section
 - Change tab style and margins
 - Change script behavior
 - Modify/remove keyboard shortcuts
 - Enable extra functionalities:
 - Smart Sidebar resize based on window size mode(Maximized/Normal)
 - Automatically collapse trees/groups
 - Tab flip: switch to previous active tab when the current active tab is clicked in the tab strip
</details>
      

## Installation
- Turn on Vertical Tabs in Firefox if you haven't already. [(How to here)](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs#w_turn-on-vertical-tabs:~:text=Turn%20on%20vertical%20tabs,-Right)
- Install a userchrome.js loader.
  - An updated one is [fx-autoconfig by MrOtherGuy](https://github.com/MrOtherGuy/fx-autoconfig)
- [Download](https://github.com/ATechnocratis/NativeTreeTabs/archive/refs/heads/main.zip) the `NativeTreeTabs.uc.js` file from this repository
 and put it inside `/chrome/JS/` folder in your Firefox profile if you use MrOtherGuy loader, or the `/chrome/` folder for other loaders.
- Restart Firefox.
- Done!
- You can customized the script style and behavior in [Firefox Customize Sidebar settings](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs#w_turn-on-vertical-tabs:~:text=Customize%20sidebar%20and%20vertical%20tabs,-After)

To avoid conflicts, make sure no addons that manage tabs are enabled.

## Updating
- Replace the `NativeTreeTabs.uc.js` file with the latest version
- Restart Firefox.
  
## Compatibility 
Expected to work on latest stable Firefox release. For Firefox Nightly, make sure to keep the script updated to the latest version to avoid breakage. Non-guaranteed support and expected conflicts with forks that heavy modify Firefox (Zen and Floorp).
