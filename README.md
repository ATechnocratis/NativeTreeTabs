
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
 - No recreation or extra resources.
 - Tab Groups support
 - Split views support
 - Keeps and extends the native tab context menu 
</details >

<details>
<summary> <b> Tab Panels (Workspaces)</b></summary>

- Organize tabs in Workspaces for even less clutter
 - Left click the Panel Header to open the Panel List
 - Drag the listed panels to reorder them
 - Middle click the Panel Header/button to instantly open a new panel
 - Scroll on the Panel header/button to switch betweens the panels
 - Right click on the header or a Panel in the dropdown list to open the Panel Context Menu
 - Rename the panel, set an icon, manage its tabs, expand/collapse its trees (`ctrl + click` to expand/collapse Tab Groups too) 
 - Move tabs between panels from the tab context menu (right click a tab)
 - Move a Tab Group in the Manage Group Popup(right click a Group label) or by multi-selecting all of its tabs
</details>

<details>
<summary> <b> Tree features </b></summary>

 - Middle click the close button to close the whole tree under a tab
 - Collapse a tree by clicking the parent favicon.
 - Clicking the close button\middle click on a collapsed tree parent tab, will close the whole tree
 - Option to automatically collapse trees/groups in settings
</details>

<details>
<summary> <b> Organize with Nest tabs.</b></summary>

 - Right click a tab(s) and select `Nest tabs`
 - A new tree root will be created and all the selected tabs/trees will be under it
 - Nest tabs will collapsed/show the tree on click just like Tab Groups
 - Right click to rename them, change color or icon
</details>

<details>
<summary> <b> Sidebar Expand on hover support</b></summary>
   
  - Just enable the expand sidebar on hover option in Firefox sidebar settings.
  - Or enable the window size mode aware, Smart sidebar resizer in the script settings.
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
 - `Ctrl + Shift + A` to make the active tab to Always Display

- Modify/remove keyboard shortcuts on Sidebar Settings (Customize sidebar option)
</details>

<details>
<summary> <b> Multiple tab select</b></summary>

- Selecting multiple tabs with `shift/ctrl + click` is still possible (native FF feature)
- Added ability to right click hold and hover over tabs to multi-select them as action target.
</details>

<details>
<summary> <b> Session Restore friendly</b></summary>

 - Saves the tree structure and the Tab panels
 - *Enable the option to restore session from Firefox settings to not loose you organized structure and panels between restarts
</details>

<details>
<summary> <b>Settings and Extras</b></summary>

 - [Open the Customize Sidebar settings](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs#w_turn-on-vertical-tabs:~:text=Customize%20sidebar%20and%20vertical%20tabs,-After) and find the Tree Tabs section
 - Change tabs style and margins
 - Change script/browser behavior
 - Modify/remove keyboard shortcuts
 - Enable extra functionalities:
 - Smart Sidebar resize based on window size mode(Maximized/Normal)
 - Automatically collapse trees/groups
 - Tab flip: switch to previous active tab when the current active tab is clicked in the tab strip
 - Option to open new tabs on Top of instead of the Bottom.
 - Set a tab to always display.
</details>
      

## Installation
- Turn on Vertical Tabs in Firefox if you haven't already. [(How to here)](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs#w_turn-on-vertical-tabs:~:text=Turn%20on%20vertical%20tabs,-Right)
- Install a userchrome.js loader.
  - An updated one is [fx-autoconfig by MrOtherGuy](https://github.com/MrOtherGuy/fx-autoconfig)
- [Download](https://github.com/ATechnocratis/NativeTreeTabs/releases/latest/download/NativeTreeTabs.uc.js) the `NativeTreeTabs.uc.js` file
 and put it inside `/chrome/JS/` folder in your Firefox profile if you use MrOtherGuy loader, or the `/chrome/` folder for other loaders.
- Restart Firefox.
- Done!
- You can customized the script style and behavior in [Firefox Customize Sidebar settings](https://support.mozilla.org/en-US/kb/use-sidebar-access-tools-and-vertical-tabs#w_turn-on-vertical-tabs:~:text=Customize%20sidebar%20and%20vertical%20tabs,-After)

<b>Important</b>: To avoid conflicts, make sure no addons that manage tabs are enabled.

## Updating

- The scrip will automatically update to the latest version, when it is available and supported.

## Compatibility 
Expected to work on stable Firefox release, also tested on Nightly and ESR 153. Non-guaranteed support (might be conflicts) with Firefox forks.
