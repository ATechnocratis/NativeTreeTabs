// ==UserScript==
// @name           Native Tree Tabs
// @version        0.2.0.4
// ==/UserScript==

const isTab = element => gBrowser.isTab(element);
const moveChildren = true;

window.nativeTreeTabs = {

  _tabEvents: ["SSTabRestoring", "TabClose", "TabOpen", "TabMove", "TabSelect"],
  lastId: 0,
  originalRemoveTab: null,
  originalPinTab: null,
  originalAddTabSplitView: null,
  originalAddToMultiSelectedTabs: null,
  originalAdvanceSelectedTab: null,
  moveNewTabsDirectlyUnderParent: true,
  customStyle: null,
  selectedtPanel: null,
  previousSelectedPanel: null,
  tabPanels: [],
  defaultPanelName: "Default Panel",
  lockCtrlTabInPanel: true,
  previousSelectedTab: null,
  selectedTab: null,
  clickedActiveTab: null,
  switchSelectedOnClick: false,
  lastRightClickedTab: null,

  init: function() {

    if (Services.prefs.getPrefType("treeTabs.behavior.lockCtrlTabInPanel") != 128) {
      Services.prefs.setBoolPref("treeTabs.behavior.lockCtrlTabInPanel", this.lockCtrlTabInPanel);
    } else {
      this.lockCtrlTabInPanel = Services.prefs.getBoolPref("treeTabs.behavior.lockCtrlTabInPanel");
    }
    Services.prefs.addObserver("treeTabs.behavior.lockCtrlTabInPanel", this);

    if (Services.prefs.getPrefType("treeTabs.behavior.switchSelectedOnClick") != 128) {
      Services.prefs.setBoolPref("treeTabs.behavior.switchSelectedOnClick", this.switchSelectedOnClick);
    } else {
      this.switchSelectedOnClick = Services.prefs.getBoolPref("treeTabs.behavior.switchSelectedOnClick");
    }
    Services.prefs.addObserver("treeTabs.behavior.switchSelectedOnClick", this);


    if (Services.prefs.getPrefType("treeTabs.defaultPanelName") != 32) {
      Services.prefs.setStringPref("treeTabs.defaultPanelName", this.defaultPanelName);
    } else {
      this.defaultPanelName = Services.prefs.getStringPref("treeTabs.defaultPanelName");
    }

    this.addDefaultPanel();
    addTabPanelButton();

    //add pref
    if (Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent") === false) {
      this.moveNewTabsDirectlyUnderParent = false;
    }
    Services.prefs.addObserver("browser.tabs.insertRelatedAfterCurrent", this);

    Services.prefs.setBoolPref("browser.tabs.selectOwnerOnClose", true);
    Services.prefs.setBoolPref("browser.tabs.dragDrop.createGroup.enabled", false);
    Services.prefs.setBoolPref("browser.tabs.groups.smart.enabled", false);

    //Check if Tabs existed before initialization
    gBrowser.tabs.forEach(this.attachTabListeners, this);
    gBrowser.tabs.forEach(this.initTab, this);

    //Add listeners
    gBrowser.addTabsProgressListener(this);
    this._tabEvents.forEach(function(aEvent) {
      gBrowser.tabContainer.addEventListener(aEvent, this);
    }, this);

    //-----Wrap some default functions-----
    // Useful when no event is omitted
    // or something needs to be executed
    // before the default function executes

    //Focus on previous (upper) tab when a tab closes
    // if no children exist.
    //  Makes use of browser.tabs.selectOwnerOnClose
    // Wrapper is used because the selected tab changes
    //  before the closing tab is fully closed
    this.originalRemoveTab = gBrowser.removeTab;
    gBrowser.removeTab = function(aTab, aOptions) {

      function checkForPinned(aTab, nextTab) {
        if (aTab.selected && nextTab && nextTab.hasAttribute("tabPanel-hidden") &&
          window.gBrowser.pinnedTabCount > 0) {
          //Don't select another panel(hidden one) tabs if a not hidden pinned tab exists
          let newowner = Array.from(gBrowser.pinnedTabsContainer.childNodes).find(tab => tab.visible && !tab.hasAttribute("tabPanel-hidden"));
          if (newowner) {
            gBrowser.setSuccessor(aTab, newowner);
          }
        }
      }
      try {

        if (aTab.hasAttribute("tabPanel-hidden")) {
          return;
        }
        let previousTab = getPreviousTab(aTab);
        let nextTab = getNextTab(aTab);
        if (aTab.selected && previousTab) {
          let tabDepth = getTreeDepth(aTab);
          let focusNext = (nextTab && getTreeDepth(nextTab) >= tabDepth) ?
            true : false;
          if (focusNext) {
            gBrowser.setSuccessor(aTab, nextTab);
          } else if (tabDepth != 0) {
            gBrowser.setSuccessor(aTab, previousTab);
          }
          //Don't select another panel(hidden one) tabs
          if (nextTab && nextTab.hasAttribute("tabPanel-hidden")) {
            if (!previousTab.hasAttribute("tabPanel-hidden")) {
              gBrowser.setSuccessor(aTab, previousTab);
            } else {
              checkForPinned(aTab, nextTab);
            }
          }
        } else {
          checkForPinned(aTab, nextTab);
        }
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalRemoveTab.apply(this, arguments);
        return;
      }
      nativeTreeTabs.originalRemoveTab.apply(this, arguments);
    };

    //Tab pinning
    this.originalPinTab = gBrowser.pinTab;
    gBrowser.pinTab = function(aTab, aOptions) {
      try {
        removeTreeOutline(aTab._tPos, aTab);
        nativeTreeTabs.tabLeaveStrip(aTab);
        setTreeDepth(aTab, 0);
        if (aTab._tPos != 0) {
          aTab.setAttribute("skipMoveForced", true);
        }
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalPinTab.apply(this, arguments);
        return;
      }
      nativeTreeTabs.originalPinTab.apply(this, arguments);
    };

    //Split View creation
    this.originalAddTabSplitView = gBrowser.addTabSplitView;
    gBrowser.addTabSplitView = function(tabsToAdd, {
      insertBefore,
      trigger,
    }) {
      try {
        nativeTreeTabs.moveSplitView(tabsToAdd, insertBefore);
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalAddTabSplitView.apply(this, arguments);
        return;
      }
      nativeTreeTabs.originalAddTabSplitView.apply(this, arguments);
    };
    //Multiselect ignore hidden tabs
    this.originalAddToMultiSelectedTabs = gBrowser.addToMultiSelectedTabs;
    gBrowser.addToMultiSelectedTabs = function(aTab) {
      try {
        if (isHidden(aTab))
          return;
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalAddToMultiSelectedTabs.apply(this, arguments);
        return;
      }
      nativeTreeTabs.originalAddToMultiSelectedTabs.apply(this, arguments);
    };
    //Ctrl + Tab don't cycle panel tabs
    //(don't select next panel tabs)
    this.originalAdvanceSelectedTab = gBrowser.tabContainer.advanceSelectedTab;
    gBrowser.tabContainer.advanceSelectedTab = function(aDir, aWrap) {
      try {
        let {
          ariaFocusedItem
        } = this;
        let startTab = ariaFocusedItem;
        if (!ariaFocusedItem || !this.allTabs.includes(ariaFocusedItem)) {
          startTab = this.selectedItem;
        }
        if (nativeTreeTabs.lockCtrlTabInPanel === false && !startTab.pinned) {
          if (aDir == 1) {
            let nextTab = getNextTab(startTab);
            if (nextTab == null || (nextTab.hasAttribute("panel-id") && nextTab.getAttribute("panel-id") != startTab.getAttribute("panel-id"))) {
              //Move from last tab of panel to the first tab of the next one INCLUDING pinned tabs
              let startTabPanelIndex = nativeTreeTabs.tabPanels.findIndex(x => x.id.toString() === startTab.getAttribute("panel-id"));
              let nextPanelIndex = (startTabPanelIndex === nativeTreeTabs.tabPanels.length - 1) ? 0 : startTabPanelIndex + 1;
              let nextPanelId = nativeTreeTabs.tabPanels[nextPanelIndex].id.toString();
              let nextPanelfirstTab = this.allTabs.find(tab => tab.visible && tab.getAttribute("panel-id") === nextPanelId);
              if (nextPanelfirstTab && nextPanelfirstTab != startTab) {
                this._selectNewTab(nextPanelfirstTab, aDir, aWrap);
                return;
              }
            }
          }
          nativeTreeTabs.originalAdvanceSelectedTab.apply(this, arguments);
          return;
        }
        let newTab = null;
        if (startTab.hidden) {
          if (aDir == 1) {
            newTab = this.allTabs.find(tab => tab.visible && !tab.hasAttribute("tabPanel-hidden"));
          } else {
            newTab = this.allTabs.findLast(tab => tab.visible && !tab.hasAttribute("tabPanel-hidden"));
          }
        } else {
          newTab = this.findNextTab(startTab, {
            direction: aDir,
            wrap: aWrap,
            filter: tab => tab.visible && !tab.hasAttribute("tabPanel-hidden"),
          });
        }
        if (newTab && newTab != startTab) {
          this._selectNewTab(newTab, aDir, aWrap);
        }
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalAdvanceSelectedTab.apply(this, arguments);
        return;
      }
    };

    //Used to find if the clicked tab is actually the selected tab or the too be selected 
    gBrowser.tabContainer.addEventListener("mousedown", this, true);

    this.addTabGroupCreateListeners();

    this.customStyle = loadNTTstyle();
    Services.prefs.addObserver("treeTabs.rootTabTopMargin", this);
    Services.prefs.addObserver("treeTabs.branchTabTopMargin", this);
    Services.prefs.addObserver("treeTabs.tabHeight", this);
    Services.prefs.addObserver("treeTabs.labelFontSize", this);
    Services.prefs.addObserver("treeTabs.tabBorderRadius", this);

    //-------------------
    console.log("Native Tree Tabs loaded.");
  },

  uninit: function() {
    gBrowser.removeTabsProgressListener(this);
    this._tabEvents.forEach(function(aEvent) {
      gBrowser.tabContainer.removeEventListener(aEvent, this);
    }, this);
    gBrowser.tabContainer.removeEventListener("mousedown", this);
    gBrowser.removeTab = this.originalRemoveTab;
    gBrowser.pinTab = this.originalPinTab;
    gBrowser.addTabSplitView = this.originalAddTabSplitView;
    gBrowser.addToMultiSelectedTabs = this.originalAddToMultiSelectedTabs;
    gBrowser.tabContainer.advanceSelectedTab = this.originalAdvanceSelectedTab;

    let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
    styleSvc.unregisterSheet(this.customStyle, styleSvc.AUTHOR_SHEET);
  },

  onLocationChange(browser, webProgress, request, locationURI, flags) {
    let aTab = gBrowser.getTabForBrowser(browser);
    setDomainAttr(aTab);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case "TabOpen":
        {
          this.tabOpen(aEvent.target);
          break;
        }
      case "SSTabRestoring":
        {
          this.tabRestore(aEvent.target);
          break;
        }
      case "TabClose":
        {
          this.tabClose(aEvent.target);
          break;
        }
      case "TabMove":
        {
          this.tabMove(aEvent.target, aEvent);
          break;
        }
      case "TabSelect":
        {
          this.tabSelected(aEvent.target);
          break;
        }
      case "dragstart":
        {
          this.tabDragStart(aEvent);
          break;
        }
      case "dragend":
        {
          this.tabDragEnd(aEvent);
          break;
        }
      case "click":
        {
          if (aEvent.currentTarget.className === "tab-icon-stack") {
            this.twistyClick(aEvent);
          } else {
            this.closeTree(aEvent);
          }
          break;
        }
      case "mousedown":
        {
          let tabgroup = aEvent.target.closest(".tab-group-label-container");
          if (tabgroup) {
            this.tabGroupDrag(tabgroup.closest("tab-group"));
          } else {
            this.markTrueSelectedTab(aEvent);
          }
        }
    }
  },

  moveSplitView: function(tabsToMove, insertionPoint) {
    tabsToMove.forEach(this.tabLeaveStrip, this);
    if (getTreeDepth(tabsToMove[0]) != 0 || getTreeDepth(tabsToMove[1]) != 0) {
      tabsToMove.forEach(function(cTab) {
        if (getTreeDepth(cTab) != 0) {
          setTreeDepth(cTab, '0');
        }
        if (!cTab.hasAttribute("skipMoveForced")) {
          cTab.setAttribute("skipMoveForced", true);
        }
      }, this);
      nativeTreeTabs.moveTabsBefore(tabsToMove, getClosestZeroDepthTab(insertionPoint, "up"));
      tabsToMove.forEach(function(cTab) {
        cTab.removeAttribute("skipMoveForced");
      }, this);
    }
  },

  //Fix children depth and maybe move them together with parent
  updateChildrenFromIndex: function(aTab, prevPosition, newPosition, tabOriginalDepth, groupState = false) {
    let tabsToMove = new Array();
    let depthUpdate = false;
    let depthFix = 1;
    let possibleChildIndex = (prevPosition >= newPosition) ?
      prevPosition + 1 : prevPosition;

    //Last tab moved or no next tab exists
    if (gBrowser.tabs.length <= possibleChildIndex)
      return;

    let nextTab = gBrowser.tabs[possibleChildIndex];

    if (nextTab === aTab) {
      nextTab = gBrowser.tabs[possibleChildIndex + 1];
    }
    let multiSelected = aTab.multiselected;

    //Check if parent tab moved inside its own nested tree
    // if so skip moving the children and fix their depth
    let legalMove = (prevPosition < newPosition) ?
      checkInsideMove(aTab, nextTab, tabOriginalDepth) : true;

    let multiSelectIllegalMove = (!legalMove && multiSelected) ? true : false;

    // Move children if it was not an inside tree move and pref moveChildren is true
    legalMove = (legalMove && moveChildren) && (!multiSelected || aTab.hasAttribute("twisted-root"));

    //In case of twisted tree always move hidden children with root 
    if (aTab.hasAttribute("twisted-root") || legalMove) {
      depthUpdate = true;
      depthFix = parseInt(tabOriginalDepth, 10) - getTreeDepth(aTab);
    }
    let isIngroup = (aTab.group && groupState) ? true : false;

    while (nextTab) {
      //skip multiselected
      while (nextTab && nextTab.multiselected && (!multiSelectIllegalMove && nextTab != aTab)) {
        nextTabTreeDepth = getTreeDepth(nextTab);
        if (nextTabTreeDepth == null || nextTabTreeDepth <= tabOriginalDepth) {
          break;
        }
        nextTab = nextTab.nextSibling;
      }

      if (!isTab(nextTab)) break;

      nextTabTreeDepth = getTreeDepth(nextTab);
      if (nextTabTreeDepth == null || nextTabTreeDepth <= tabOriginalDepth ||
        (depthUpdate && !isHidden(nextTab) && !legalMove) ||
        (nextTab === aTab && legalMove)) {
        break;
      }
      if (depthUpdate) {
        tabsToMove.push(nextTab);
        nextTab.setAttribute("skipMoveForced", true);
      }
      let newDepth = parseInt(nextTabTreeDepth, 10) - depthFix;
      setTreeDepth(nextTab, newDepth);
      nextTab = getNextTab(nextTab);
    }
    if (tabsToMove.length > 0) {
      gBrowser.moveTabsAfter(tabsToMove, aTab);
      tabsToMove.forEach(function(cTab) {
        cTab.removeAttribute("skipMoveForced");
      }, this);
    }
  },

  //Similar to updateChildrenFromIndex
  // but updates children depth level ONLY
  //Used after dragend event, so must be
  // as light as possible
  // Useful when no tab move occurred but the
  // dragevent changed the parent depth level
  updateChildrenLite: function(aTab, tabOriginalDepth) {
    let nextTab = getNextTab(aTab);
    let depthFix = parseInt(tabOriginalDepth, 10) - getTreeDepth(aTab);

    while (nextTab) {
      while (nextTab && nextTab.multiselected) {
        nextTab = nextTab.nextSibling;
      }
      if (!isTab(nextTab))
        break;
      nextTabTreeDepth = getTreeDepth(nextTab);
      if (nextTabTreeDepth == null || nextTabTreeDepth <= tabOriginalDepth) {
        break;
      }
      let newDepth = parseInt(nextTabTreeDepth, 10) - depthFix;
      setTreeDepth(nextTab, newDepth);
      nextTab = getNextTab(nextTab);
    }
  },

  multiselectedDepthUpdate: function(selectedTabs, newDepth, aTab) {
    newDepth = parseInt(newDepth, 10);
    let selectedIds = new Map();
    selectedTabs.forEach(function(sTab) {
      selectedIds.set(sTab.getAttribute("tree-id"), sTab)
    }, this);
    selectedTabs.forEach(function(sTab) {
      let depthFix;
      let oldAncestorId = sTab.getAttribute("multiSelectedAncestor");
      if (oldAncestorId) {
        let newParent = selectedIds.get(oldAncestorId);
        depthFix = parseInt(newParent.getAttribute("new-tree-depth"), 10) + 1;
        setOpener(sTab, newParent);
        sTab.setAttribute("multiSelectedAncestorFixed", true);
        sTab.removeAttribute("multiSelectedAncestor");
      } else {
        depthFix = newDepth;
        copyOpener(sTab, aTab);
      }
      sTab.setAttribute("new-tree-depth", depthFix);
    }, this);
    selectedTabs.forEach(function(sTab) {
      let depthFix = sTab.getAttribute("new-tree-depth");
      let oldDepth = getTreeDepth(sTab);
      setTreeDepth(sTab, depthFix);
      if (depthFix == 0)
        removeOpener(sTab);
      sTab.removeAttribute("new-tree-depth");
      sTab.removeAttribute("dragStartPos");
      this.updateChildrenLite(sTab, oldDepth);
    }, this);
  },

  tabDragStart: function(aEvent) {
    let selectedTabs = gBrowser.selectedTabs;
    if (selectedTabs.length > 1) {
      selectedTabs.forEach(function(sTab) {
        SessionStore.setCustomTabValue(sTab, "draggedFromWindow", window.docShell.outerWindowID.toString());
        sTab.removeAttribute("multiSelectedAncestorFixed");
        sTab.removeAttribute("multiSelectedAncestor");
        sTab.setAttribute("dragStartPos", sTab._tPos);
        if (sTab.getAttribute("tree-depth") != '0') {
          let rootTab = getRootTab(sTab);
          while (isTab(rootTab) && !rootTab.multiselected) {
            rootTab = getRootTab(rootTab);
          }
          if (rootTab != null) {
            sTab.setAttribute("multiSelectedAncestor", rootTab.getAttribute("tree-id"));
          }
        }
      }, this);
    } else {
      let aTab = aEvent.currentTarget;
      SessionStore.setCustomTabValue(aTab, "draggedFromWindow", window.docShell.outerWindowID.toString());
      aTab.setAttribute("dragStartPos", aTab._tPos);
      if (aTab.getAttribute("tree-depth") != '0') {
        let rootTab = getRootTab(aTab);
        //should not fail if everything worked normal
        if (rootTab) {
          aTab.setAttribute("dragStartoldParent", rootTab.getAttribute("tree-id"));
        }
      } else
        aTab.setAttribute("dragStartoldParent", "");
      if (moveChildren)
        outlineTree(aTab, true);
    }
  },

  tabDragEnd: function(aEvent) {

    let aTab = aEvent.target;

    setTimeout(() => {
      SessionStore.deleteCustomTabValue(aTab, "draggedFromWindow");
    }, 1000);

    let selectedTabs = gBrowser.selectedTabs;
    if (selectedTabs.length > 1) {
      selectedTabs.forEach(function(sTab) {
        setTimeout(() => {
          SessionStore.deleteCustomTabValue(sTab, "draggedFromWindow");
        }, 1000);
      });
      aTab = selectedTabs[0];
    }
    //....
    if (aTab.splitview) {
      return;
    }
    let previousTab = aTab.previousSibling;
    let nextTab = getNextTab(aTab);
    let oldDepth = getTreeDepth(aTab);
    while (previousTab && (isHidden(previousTab) || previousTab.multiselected)) {
      previousTab = previousTab.previousSibling;
    }
    while (nextTab && (isHidden(nextTab) || nextTab.multiselected)) {
      nextTab = getNextTab(nextTab);
    }
    let previousPosition = parseInt(aTab.getAttribute("dragStartPos"), 10);
    let oldParent = aTab.getAttribute("dragStartoldParent");
    aTab.removeAttribute("dragStartoldParent");
    let currentPosition = aTab._tPos;
    let childrenCount = 0;
    let insideMove = false;
    if (previousPosition != currentPosition) {
      if (isTab(previousTab)) {
        let outlineStyle = previousTab.querySelector(".tab-background");
        if (outlineStyle != null && outlineStyle.style.outline.toString() === "red solid 1px")
          insideMove = true;
      }
      removeTreeOutline(previousPosition, aTab);
      childrenCount = removeTreeOutline(currentPosition, aTab);
    } else outlineTree(aTab, false);
    //temp hack 
    if (childrenCount > 1 && !insideMove) {
      let childMargin = getComputedStyle(nextTab).getPropertyValue("margin-top");
      childMargin = parseInt(childMargin, 10);
      let shelfMargin = getComputedStyle(aTab).getPropertyValue("margin-top");
      shelfMargin = parseInt(shelfMargin, 10);
      childrenCount = (childrenCount - 1) * (aTab.offsetHeight + childMargin) + shelfMargin;
    } else {
      childrenCount = 0;
    }
    let offsetY = aEvent.offsetY - window.screenY - childrenCount;
    //....
    if (moveChildren) {
      while (isTab(nextTab) && getTreeDepth(nextTab) > oldDepth) {
        nextTab = getNextTab(nextTab);
      }
    }
    let newDepth = -1;
    let previousTabDepth = null;
    let nextTabDepth = null;
    let shouldUpdateChildren = false;

    if (isTab(previousTab)) previousTabDepth = getTreeDepth(previousTab);
    if (isTab(nextTab)) nextTabDepth = getTreeDepth(nextTab);

    //Case 0: Dropped inside a tab -> Set tab as parent
    if (previousTabDepth != null && offsetY < 10) {
      //Tab was already direct parent -> Swap
      let isAlreadyParent = (!aTab.multiselected && oldParent != "" &&
          oldParent === previousTab.getAttribute("tree-id")) ?
        true : false;
      if (isAlreadyParent) {
        aTab.setAttribute("skipMoveForced", true);
        gBrowser.moveTabAfter(aTab, previousTab);
        aTab.removeAttribute("skipMoveForced");
        previousTab.setAttribute("skipMoveForced", true);
        gBrowser.moveTabTo(previousTab, {
          tabIndex: currentPosition
        });
        previousTab.removeAttribute("skipMoveForced");
        setTreeDepth(previousTab, oldDepth);
        setTreeDepth(aTab, previousTabDepth);
        if (aTab.hasAttribute("twisted-root")) {
          aTab.removeAttribute("twisted-root");
          SessionStore.deleteCustomTabValue(aTab, "twisted-root");
          previousTab.setAttribute("twisted-root", true);
          SessionStore.setCustomTabValue(previousTab, "twisted-root", 'true');
        }
        //dirty swap
        let oldTreeId = aTab.getAttribute("tree-id");
        setTabTreeID(aTab, previousTab.getAttribute("tree-id"));
        setTabTreeID(previousTab, oldTreeId);
        copyOpener(aTab, previousTab);
        setOpener(previousTab, aTab);
        return;
      }
      newDepth = previousTabDepth + 1;
      setOpener(aTab, previousTab);
      shouldUpdateChildren = true;
      //Unravel twisted root if new parent tree is hidden
      if (previousTab.hasAttribute("twisted-root")) {
        this.toggleTwist(previousTab);
      }
    } else {
      //Case 1: Dropped at the bottom border of tab
      // Move at the end of a tree and become simpling
      if (previousTabDepth != null && offsetY < 14 && (nextTabDepth == null || nextTabDepth == 0)) {
        newDepth = previousTabDepth;
        shouldUpdateChildren = true;
        if (newDepth != 0) copyOpener(aTab, previousTab);
      }
      //Case 2: Dropped under a tab with space between
      // Don't stick, became a zero depth root
      else if ((nextTabDepth == null || nextTabDepth == 0) && offsetY > 17) {
        newDepth = 0;
        shouldUpdateChildren = true;
      }
    }
    //Case 3: None of the above
    if (newDepth == -1) {
      aTab.removeAttribute("dragStartPos");
      return;
    }

    if (selectedTabs.length > 1) {
      //Multiple selected tabs
      shouldUpdateChildren = false;
      this.multiselectedDepthUpdate(selectedTabs, newDepth, aTab);
    } else {
      aTab.removeAttribute("dragStartPos");
      setTreeDepth(aTab, newDepth);
      if (newDepth == 0) {
        removeOpener(aTab);
      }
    }
    if (shouldUpdateChildren) {
      this.updateChildrenLite(aTab, oldDepth);
    }
  },

  checkForPanelOverStep: function(aTab, sTab, direction) {
    let aTabPanelId = aTab.getAttribute("panel-id");
    if (aTabPanelId == null) return;
    let aTabPanelIndex = this.tabPanels.findIndex(x => x.id.toString() === aTabPanelId);
    let tabsToMove = new Array();

    while (isTab(sTab) && sTab.hasAttribute("tabPanel-hidden")) {
      let sTabPanelId = sTab.getAttribute("panel-id");
      let sTabPanelIndex = this.tabPanels.findIndex(x => x.id.toString() === sTabPanelId);
      if (direction === "After" && sTabPanelIndex > aTabPanelId) {
        tabsToMove.push(sTab);
        sTab.setAttribute("skipMoveForced", true);
        sTab = sTab.previousSibling;
      } else if (direction === "Before" && sTabPanelIndex < aTabPanelId) {
        tabsToMove.push(sTab);
        sTab.setAttribute("skipMoveForced", true);
        sTab = sTab.nextSibling;
      } else {
        break;
      }
    }
    if (tabsToMove.length > 0) {
      if (direction === "After") {
        nativeTreeTabs.moveTabsAfter(tabsToMove, aTab.group);
      } else {
        nativeTreeTabs.moveTabsBefore(tabsToMove, aTab.group);
      }
      tabsToMove.forEach(function(cTab) {
        cTab.removeAttribute("skipMoveForced");
      }, this);
    }
  },

  recTraverseTree: function(aTab, aTabDepth, currentRootDepth) {
    let nextTab = aTab.nextSibling;
    while (isTab(nextTab)) {
      nextDepth = getTreeDepth(nextTab);
      if (nextDepth == null || nextDepth < aTabDepth) {
        return nextTab;
      } else if (nextDepth === aTabDepth) {
        copyOpener(nextTab, aTab);
        setTreeDepth(nextTab, currentRootDepth);
        nextTab = nextTab.nextSibling;
      } else {
        setOpener(nextTab, nextTab.previousSibling);
        setTreeDepth(nextTab, currentRootDepth + 1);
        nextTab = this.recTraverseTree(nextTab, nextDepth, currentRootDepth + 1);
      }
    }
    return null;
  },

  checkTreeSplit: function(aTab, aEvent) {
    let inGroup = (aTab.group && aEvent.detail.previousTabState.tabGroupId === aEvent.detail.currentTabState.tabGroupId) ? true : false;

    if (inGroup) {
      let previousTab = aTab.group.previousSibling;

      if (isTab(previousTab) && previousTab.group != aTab.group) {
        let nextTab = aTab.group.nextSibling;

        //Check if group moved over hidden tabs
        this.checkForPanelOverStep(aTab, previousTab, "After");
        this.checkForPanelOverStep(aTab, nextTab, "Before");

        //Check if moved inside a tree ( Split tree )
        //Create new zero level depth roots from subtrees
        while (isTab(nextTab)) {
          nextDepth = getTreeDepth(nextTab);
          if (!isTab(nextTab) || nextDepth === 0) {
            break;
          }
          removeOpener(nextTab);
          setTreeDepth(nextTab, 0);
          nextTab = this.recTraverseTree(nextTab, nextDepth, 0);
        }
      }
    }
  },

  //Adjust depth level according to previous and next
  // (up and down) tab levels
  // *if they exist
  tabMove: function(aTab, aEvent) {

    //Tab Group label drag, skip updating
    // tabs inside the group
    if (aTab.hasAttribute("tabGroupDrag")) {
      this.checkTreeSplit(aTab, aEvent);
      aTab.removeAttribute("tabGroupDrag");
      return;
    }

    //Skip update
    if (aTab.hasAttribute("skipMoveForced") && !aTab.splitview) {
      aTab.removeAttribute("skipMoveForced");
      return;
    }
    //Multiple selected case
    if (aTab.multiselected) {
      if (aTab.hasAttribute("multiSelectedAncestorFixed")) {
        aTab.removeAttribute("multiSelectedAncestorFixed");
        return;
      }
      if (aTab.hasAttribute("multiSelectedAncestor")) {
        let ancestorId = aTab.getAttribute("multiSelectedAncestor").toString();
        // aTab.removeAttribute("multiSelectedAncestor");
        let ancestor = gBrowser.selectedTabs.find(x => x.getAttribute("tree-id").toString() === ancestorId);
        setOpener(aTab, ancestor);
        let depthFix = getTreeDepth(ancestor) + 1;
        setTreeDepth(aTab, depthFix);
        return;
      }
    }
    let tabOriginalDepth = getTreeDepth(aTab);
    let prevPosition = aEvent.detail.previousTabState.tabIndex;
    let newPosition = aEvent.detail.currentTabState.tabIndex;

    //Create group case
    if (prevPosition === newPosition) {
      this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, aEvent.detail.previousTabState.tabGroupId);
      return;
    }

    //Whole group ungroup
    if (aEvent.detail.previousTabState.tabGroupId && !aEvent.detail.currentTabState.tabGroupId &&
      gBrowser.getTabGroupById(aEvent.detail.previousTabState.tabGroupId) == null && aEvent.detail.telemetrySource != "drag") {
      return;
    }

    let inGroup = (aTab.group && aEvent.detail.previousTabState.tabGroupId === aEvent.detail.currentTabState.tabGroupId) ? true : false;
    let previousTab = aTab.previousSibling;
    let nextTab = aTab.nextSibling;
    let aTabTreeId = aTab.getAttribute("tree-id");

    //Used for drop under last position in tab strip
    // dragend will overwrite this if (case 0,1,2 happens)
    if (newPosition == gBrowser.tabs.length - 1 || (isTab(nextTab) && nextTab.hasAttribute("tabPanel-hidden"))) {
      setTreeDepth(aTab, '0');
      this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, aEvent.detail.previousTabState.tabGroupId);
      return;
    }

    //Split view moved
    if (aTab.splitview) {
      if (aTab.getAttribute("tree-depth") != '0') {
        setTreeDepth(aTab, '0');
      }
      let trueNext = getNextTab(aTab.splitview);
      aTab.splitview.childNodes.forEach(function(cTab) {
        if (cTab.getAttribute("tree-depth") != '0') {
          setTreeDepth(cTab, '0');
        }
        //This is to make sure that when the split
        //breaks the tabs stay at 0 depth 
        if (!cTab.hasAttribute("skipMoveForced")) {
          cTab.setAttribute("skipMoveForced", true);
        }
      }, this);
      if (trueNext && trueNext.hasAttribute("tree-depth") && getTreeDepth(trueNext) != 0) {
        let direction = 'up';
        if (newPosition > prevPosition) direction = 'down';
        gBrowser.moveTabBefore(aTab.splitview, getClosestZeroDepthTab(trueNext, direction));
      }
      return;
    }

    //illegal move
    // twisted root tab moved under its own hidden tree
    if (aTab.hasAttribute("twisted-root")) {
      if (isTab(previousTab) && previousTab.hasAttribute("hidden-child") &&
        previousTab.getAttribute("hidden-child-rootID") === aTabTreeId) {
        aTab.setAttribute("skipMoveForced", true);
        gBrowser.moveTabBefore(aTab, gBrowser.tabs[prevPosition]);
        aTab.removeAttribute("skipMoveForced");
        return;
      }
    }
    //illegal 2
    // tab moved inside a hidden tree
    if (isTab(nextTab) && nextTab.hasAttribute("hidden-child") &&
      aTabTreeId != nextTab.getAttribute("hidden-child-rootID")) {
      let newPosition = nextTab;
      while (nextTab && nextTab.hasAttribute("hidden-child") &&
        aTabTreeId != nextTab.getAttribute("hidden-child-rootID")) {
        newPosition = nextTab;
        nextTab = getNextTab(nextTab);
      }
      aTab.setAttribute("skipMoveForced", true);
      gBrowser.moveTabAfter(aTab, newPosition);
      aTab.removeAttribute("skipMoveForced");
      if (aTab._tPos == gBrowser.tabs.length - 1) {
        setTreeDepth(aTab, '0');
        this.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, tabOriginalDepth, aEvent.detail.previousTabState.tabGroupId);
        return;
      }
    }

    //Ignore hidden tabs and tabs selected to move 
    while (previousTab && (isHidden(previousTab) || previousTab.multiselected)) {
      previousTab = getPreviousTab(previousTab);
    }
    while (nextTab && (isHidden(nextTab) || nextTab.multiselected)) {
      nextTab = nextTab.nextSibling;
    }
    //We don't care for tabs outside the group if the tab is grouped
    if (inGroup) {
      if (isTab(previousTab) && previousTab.group != aTab.group) {
        //Check if move inside tree ( Split tree )
        previousTab = null;
      }
      if (isTab(nextTab) && nextTab.group != aTab.group) {
        nextTab = null;
      }
    }

    let newDepth = getTreeDepth(aTab);
    let previousTabDepth;
    if (isTab(previousTab)) {
      previousTabDepth = getTreeDepth(previousTab);
      newDepth = previousTabDepth;
      let newOpener = previousTab;
      if (isTab(nextTab)) {
        let nextTabDepth = getTreeDepth(nextTab);
        if (nextTabDepth > previousTabDepth) {
          newDepth = nextTabDepth;
          newOpener = nextTab;
        }
      }
      copyOpener(aTab, newOpener);
    } else {
      newDepth = 0;
      removeOpener(aTab);
    }
    let oldDepth = getTreeDepth(aTab);
    if (oldDepth != newDepth) {
      setTreeDepth(aTab, newDepth);
    }
    //Update children
    this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, aEvent.detail.previousTabState.tabGroupId);

    //If aTab became child of twisted tab then unravel it
    if (isTab(previousTab)) {
      previousTabDepth = getTreeDepth(previousTab);
      if (previousTab.hasAttribute("twisted-root") && previousTabDepth < newDepth) {
        this.toggleTwist(previousTab);
      }
    }
  },

  tabGroupDrag: function(tabgroup) {
    tabgroup.tabs.forEach(function(aTab) {
      aTab.setAttribute("tabGroupDrag", "true");
    }, this);

    finisheDrag = function finisheDrag(aEvent) {
      let tabgroup = aEvent.target.closest("tab-group");
      tabgroup.tabs.forEach(function(aTab) {
        aTab.removeAttribute("tabGroupDrag");
      }, this);
      tabgroup.removeEventListener("mouseup", finisheDrag);
    }
    tabgroup.addEventListener("mouseup", finisheDrag, true);
  },

  markTrueSelectedTab: function(aEvent) {

    if (aEvent.button !== 0 || aEvent.ctrlKey || aEvent.shiftKey || aEvent.altKey || aEvent.metaKey) {
      return;
    }
    let aTab = aEvent.target.closest(".tabbrowser-tab");
    if (!aTab) return;
    this.clickedActiveTab = aTab && aTab.selected ? aTab : null;

  },

  previousSwitch: function(aEvent) {

    if (nativeTreeTabs.switchSelectedOnClick === false) {
      return;
    }
    //only on left click (with no modifiers)
    if (aEvent.button !== 0 || aEvent.ctrlKey || aEvent.shiftKey || aEvent.altKey || aEvent.metaKey) {
      nativeTreeTabs.clickedActiveTab = null;
      return;
    }
    //mouseddown on (truly) selected tab
    if (!nativeTreeTabs.clickedActiveTab) {
      nativeTreeTabs.clickedActiveTab = null;
      return;
    }

    //Ignore clicks on buttons
    if (aEvent.target.closest(".tab-audio-button, .tab-close-button, .tab-icon-overlay")) {
      return;
    }
    if (SidebarController._sidebarMain.__expanded) {
      if (aEvent.target.closest(".tab-icon-stack")) {
        return;
      }
    }

    let aTab = aEvent.target.closest(".tabbrowser-tab");

    let pSTab = nativeTreeTabs.previousSelectedTab;
    if (!aTab || aTab !== nativeTreeTabs.clickedActiveTab || !aTab.selected ||
      !pSTab || pSTab === aTab || pSTab.closing) {

      nativeTreeTabs.clickedActiveTab = null;
      return;
    }

    gBrowser.selectedTab = pSTab;
    nativeTreeTabs.clickedActiveTab = null;
  },


  tabSelected: function(aTab) {

    //Select previous selected on click current selected click
    if (gBrowser.selectedTab !== this.selectedTab) {
      this.previousSelectedTab = this.selectedTab;
      this.selectedTab = aTab;
    }
    if (this.previousSelectedTab) {
      this.previousSelectedTab.removeEventListener("click", this.previousSwitch);
    }
    aTab.addEventListener("click", this.previousSwitch, true);

    //Hidden tab selected unravel root
    if (aTab.hasAttribute("hidden-child")) {
      let rootId = aTab.getAttribute("hidden-child-rootID");
      previousTab = getPreviousTab(aTab);
      while (isTab(previousTab)) {
        if (previousTab.hasAttribute("twisted-root") && previousTab.getAttribute("tree-id") === rootId) {
          this.toggleTwist(previousTab);
          break;
        }
        previousTab = getPreviousTab(previousTab);
      }
      //Worst case ( tab left hidden and couldn't find hidden root)
      // force unhide
      aTab.removeAttribute("hidden-child");
      aTab.removeAttribute("hidden-child-rootID");
      SessionStore.deleteCustomTabValue(aTab, "hidden-child");
      SessionStore.deleteCustomTabValue(aTab, "hidden-child-rootID");
    }
    if (aTab.hasAttribute("panel-id")) {
      let panelId = aTab.getAttribute("panel-id");
      //Tab panel is hidden => show
      if (aTab.hasAttribute("tabPanel-hidden")) {
        this.tabPanelShow(panelId, changeSelectedTab = false);
      }
      // Update panel last-selected tab
      let panel = this.tabPanels.find(x => x.id.toString() === panelId);
      if (panel) {
        panel.selectedTab = aTab;
      }
    }
  },

  //Closes the tree under a tab
  // when middle click is pressed
  // on close button
  // or when the tab is a twisted tree
  closeTree: function(aEvent) {
    let button = aEvent.button;
    let aTab = aEvent.target.closest('tab');
    if (button == 1 || (button == 0 && aTab.hasAttribute("twisted-root"))) {
      let nextTab = getNextTab(aTab);
      let treeDepth = getTreeDepth(aTab);
      if (!isTab(nextTab) || !nextTab.hasAttribute("tree-depth") ||
        (getTreeDepth(nextTab) <= treeDepth)) return;
      let tabsToRemove = new Array();
      tabsToRemove.push(aTab);
      while (nextTab) {
        nextTabTreeDepth = getTreeDepth(nextTab);
        if (nextTabTreeDepth == null || nextTabTreeDepth <= treeDepth) {
          break;
        }
        tabsToRemove.push(nextTab);
        nextTab = getNextTab(nextTab);
      }
      window.gBrowser.removeTabs(tabsToRemove, animate = false, suppressWarnAboutClosingWindow = true);
      aEvent.preventDefault();
    }
  },

  toggleTwist: function(aTab) {
    let nextTab = getNextTab(aTab);
    let treeDepth = getTreeDepth(aTab);
    //Only for tabs with children
    if (!isTab(nextTab) || !nextTab.hasAttribute("tree-depth") ||
      (getTreeDepth(nextTab) <= treeDepth))
      return;
    let unhide = false;
    let rootId = aTab.getAttribute("tree-id").toString();
    if (aTab.hasAttribute("twisted-root")) {
      unhide = true;
      aTab.removeAttribute("twisted-root");
      SessionStore.deleteCustomTabValue(aTab, "twisted-root");
    } else {
      aTab.setAttribute("twisted-root", true);
      SessionStore.setCustomTabValue(aTab, "twisted-root", 'true');
    }
    while (nextTab) {
      nextTabTreeDepth = getTreeDepth(nextTab);
      if (nextTabTreeDepth == null || nextTabTreeDepth <= treeDepth) {
        break;
      } else if (unhide) {
        nextTab.removeAttribute("hidden-child");
        nextTab.removeAttribute("hidden-child-rootID");
        SessionStore.deleteCustomTabValue(nextTab, "hidden-child");
        SessionStore.deleteCustomTabValue(nextTab, "hidden-child-rootID");
      } else {
        nextTab.setAttribute("hidden-child", true);
        nextTab.setAttribute("hidden-child-rootID", rootId);
        SessionStore.setCustomTabValue(nextTab, "hidden-child", 'true');
        SessionStore.setCustomTabValue(nextTab, "hidden-child-rootID", rootId);
      }
      //Don't unravel nested hidden trees
      if (nextTab.hasAttribute("twisted-root")) {
        let treeDepthNested = getTreeDepth(nextTab);
        nextTab = getNextTab(nextTab);
        while (nextTab) {
          nextTabTreeDepthNested = getTreeDepth(nextTab);
          if (nextTabTreeDepthNested == null || nextTabTreeDepthNested <= treeDepthNested) {
            break;
          }
          nextTab = getNextTab(nextTab);
        }
      } else nextTab = getNextTab(nextTab);
    }
  },

  twistyClick: function(aEvent) {
    if (!SidebarController._sidebarMain.__expanded) {
      return;
    }
    let aTab = aEvent.target.closest('tab');
    this.toggleTwist(aTab);
  },

  tabClose: function(aTab) {
    if (aTab.hasAttribute("panel-id")) {
      let panelId = aTab.getAttribute("panel-id");
      window.nativeTreeTabs.panelDecreaseCount(panelId, aTab);
    }
    this.tabLeaveStrip(aTab);
  },

  tabLeaveStrip: function(aTab) {
    //temp tab leave it be
    if (!aTab.hasAttribute("tree-id")) {
      return;
    }
    let nextTab = getNextTab(aTab);
    let treeDepth = getTreeDepth(aTab);
    //Case when a tab is getting replaced.
    //Browser opens a new tab and closes the old one.
    // Usually happens when a tab opens
    // a link in a different container.
    //Don't update children depth then, just replace the opener.
    if (nextTab && !nextTab.openerTab &&
      getNextTab(nextTab) &&
      aTab.hasAttribute("tree-id") &&
      getNextTab(nextTab).getAttribute("opener-id") === aTab.getAttribute("tree-id")) {
      let twistedRootClosed = false;
      let newRoot = nextTab;
      if (aTab.hasAttribute("twisted-root")) {
        twistedRootClosed = true;
        newRoot.setAttribute("twisted-root", true);
        SessionStore.setCustomTabValue(newRoot, "twisted-root", 'true');
      }
      setTreeDepth(newRoot, treeDepth);
      let rootId = newRoot.getAttribute("tree-id");
      if (!rootId) {
        //Generate new unique id 
        rootId = (performance.now() + performance.timeOrigin).toFixed(3) * 1000;
        while (rootId === this.lastId)
          rootId = rootId + 1;
        this.lastId = rootId;
        setTabTreeID(newRoot, rootId.toString());
      }
      rootId = rootId.toString();
      nextTab = getNextTab(newRoot);
      while (nextTab) {
        nextTabTreeDepth = getTreeDepth(nextTab);
        if (nextTabTreeDepth == null || nextTabTreeDepth <= treeDepth) {
          break;
        }
        setOpener(nextTab, newRoot);
        //if replacing a twisted tab -> twisted
        if (twistedRootClosed) {
          nextTab.setAttribute("hidden-child-rootID", rootId);
          SessionStore.setCustomTabValue(nextTab, "hidden-child-rootID", rootId);
        }
        nextTab = getNextTab(nextTab);
      }
      return;

    } else if (aTab.hasAttribute("twisted-root")) {
      //unravel if twisted
      this.toggleTwist(aTab);
    }
    //Update children depth level
    while (nextTab) {
      nextTabTreeDepth = getTreeDepth(nextTab);
      if (nextTabTreeDepth == null || nextTabTreeDepth <= treeDepth) {
        break;
      }
      let newDepth = nextTabTreeDepth - 1;
      if (!nextTab.multiselected && !nextTab.hasAttribute("draggedFromWindow")) {
        setTreeDepth(nextTab, newDepth);
      }
      nextTab = getNextTab(nextTab);
    }
  },

  tabRestore: function(aTab) {
    let restoredDepth = SessionStore.getCustomTabValue(aTab, "tree-depth");
    let restoredOpenerId = SessionStore.getCustomTabValue(aTab, "opener-id");
    if (restoredOpenerId) {
      aTab.setAttribute("opener-id", restoredOpenerId);
    }
    if (restoredDepth && restoredDepth != '0' && restoredOpenerId) {
      let previousTab = getPreviousTab(aTab);
      if (previousTab && previousTab.hasAttribute("tree-id") && previousTab.getAttribute("tree-id") === restoredOpenerId) {
        //found parent
        restoredDepth = getTreeDepth(previousTab) + 1;
      }
      //Didn't found parent and need fix
      else if (getPreviousTab(aTab)) {
        let prvDepth = getTreeDepth(getPreviousTab(aTab));
        if (prvDepth && restoredDepth > prvDepth + 1) {
          restoredDepth = prvDepth + 1;
        }
      }
    }
    if (restoredDepth) {
      setTreeDepth(aTab, restoredDepth);
      //Fix children depth when a root is restored
      let nextTab = getNextTab(aTab);
      let restoredTreeId = SessionStore.getCustomTabValue(aTab, "tree-id");
      if (restoredTreeId) {
        aTab.setAttribute("tree-id", restoredTreeId);
        let childrenId = new Array();
        childrenId.push(restoredTreeId);
        let rootTreeDepth = parseInt(restoredDepth, 10);
        //Find direct children (Depth difference == 1 )
        while (nextTab && nextTab.hasAttribute("opener-id") && nextTab.getAttribute("opener-id") === restoredTreeId) {
          let depthPreRestore = getTreeDepth(nextTab);
          setTreeDepth(nextTab, rootTreeDepth + 1);
          nextTab = getNextTab(nextTab);
          //Fix grandchildren
          while (nextTab) {
            nextTabTreeDepth = getTreeDepth(nextTab);
            if (nextTabTreeDepth == null || nextTabTreeDepth <= depthPreRestore) {
              break;
            }
            let newDepth = nextTabTreeDepth - depthPreRestore + rootTreeDepth + 1;
            setTreeDepth(nextTab, newDepth);
            nextTab = getNextTab(nextTab);
          }
        }
      }
    }
    let twistedRoot = SessionStore.getCustomTabValue(aTab, "twisted-root");
    if (twistedRoot) {
      aTab.setAttribute("twisted-root", true);
    }
    let hiddenChild = SessionStore.getCustomTabValue(aTab, "hidden-child");
    let hiddenChildRoot = SessionStore.getCustomTabValue(aTab, "hidden-child-rootID");
    if (hiddenChild && hiddenChildRoot) {
      aTab.setAttribute("hidden-child", true);
      aTab.setAttribute("hidden-child-rootID", hiddenChildRoot);
    }

    let restorePaneldId = SessionStore.getCustomTabValue(aTab, "panel-id");

    if (restorePaneldId) {
      panelId = restorePaneldId.toString();
      let panel = this.tabPanels.find(x => x.id.toString() === panelId);

      if (!panel) {
        //panel no longer exists => restore it
        let relabel = "restored " + panelId;
        let restorePanelLabel = SessionStore.getCustomTabValue(aTab, "panel-label");
        if (!restorePanelLabel) {
          restorePanelLabel = "Restored Panel";
        }
        let previousPanelIndex;
        let previousTab = getPreviousTab(aTab);
        if (previousTab) {
          previousPanelIndex = getPreviousTab(aTab).getAttribute("panel-id");
        }
        panel = this.tabPanelOpen(tabs = null, label = restorePanelLabel, id = panelId, forceShow = false, index = previousPanelIndex);
      } else {
        if (!findPanelInMenu(panel)) {
          addNewPanelInMenu(panel, checkIt = false);
        }
      }
      setPanel(aTab, panel, window);
      foundPanel = true;
      if (aTab.selected) {
        this.tabPanelShow(panel.id, changeSelectedTab = false);
      }
      if (this.selectedtPanel === panel) {
        unHideTab(aTab);
      } else if (!aTab.selected) {
        hideTab(aTab);
      }
    }
  },

  tabOpen: function(aTab) {
    setPanelLite(aTab, window.nativeTreeTabs.selectedtPanel, window);
    this.initTreeDepth(aTab);
    this.observeTab(aTab, this);
  },

  attachTabListeners: function(aTab) {
    aTab.addEventListener("dragend", this);
    aTab.addEventListener("dragstart", this);
    aTab.querySelector(".tab-icon-stack").addEventListener("click", this);
    aTab.querySelector(".tab-close-button").addEventListener("click", this);
  },

  initTab: function(aTab) {
    setDomainAttr(aTab);
    let restorePaneldId = SessionStore.getCustomTabValue(aTab, "panel-id");
    let dragged = SessionStore.getCustomTabValue(aTab, "draggedFromWindow");
    let previousTab = getPreviousTab(aTab);
    //Don't restore panel for out of window dragging
    if (dragged) {
      let thisWindowId = window.docShell.outerWindowID.toString();
      if (dragged != thisWindowId) {
        restorePaneldId = false;
      }
    }

    let foundPanel = false;

    if (restorePaneldId) {
      panelId = restorePaneldId.toString();
      let panel = this.tabPanels.find(x => x.id.toString() === panelId);

      if (!panel) {
        //panel no longer exists => restore it
        let relabel = "restored " + panelId;
        let restorePanelLabel = SessionStore.getCustomTabValue(aTab, "panel-label");
        if (!restorePanelLabel) {
          restorePanelLabel = "Restored Panel";
        }
        let previousPanelIndex;


        if (previousTab) {
          previousPanelIndex = previousTab.getAttribute("panel-id");
        }
        panel = this.tabPanelOpen(tabs = null, label = restorePanelLabel, id = panelId, forceShow = false, index = previousPanelIndex);

      } else {
        if (!findPanelInMenu(panel)) {
          addNewPanelInMenu(panel, checkIt = false);
        } else {
          //Correct panel wrong index
          // probably caused by pinned tab restore (happens first of all)

          if (previousTab && previousTab.hasAttribute("panel-id") && previousTab.hasAttribute("tabPanel-hidden")) {
            let previousPanelId = previousTab.getAttribute("panel-id");
            let previousPanelIndex = nativeTreeTabs.tabPanels.findIndex(x => x.id.toString() === previousPanelId);
            if (previousPanelIndex && nativeTreeTabs.tabPanels.indexOf(panel) < previousPanelIndex) {
              moveItemInTheArray(nativeTreeTabs.tabPanels, nativeTreeTabs.tabPanels.indexOf(panel), previousPanelIndex);
              let menupopup = document.getElementById('tab-panels-menupopup-view');
              //Put it in the right position
              //Move it in the panel array too
              if (menupopup) {
                let panelItemInmenu = menupopup.querySelector('[panel-id="' + panel.id.toString() + '"]');
                let prevPanelItemInmenu = menupopup.querySelector('[panel-id="' + previousPanelId + '"]');
                if (panelItemInmenu && panelItemInmenu) {
                  prevPanelItemInmenu.after(panelItemInmenu)
                  // menupopup.insertBefore(prevPanelItemInmenu,panelItemInmenu);
                }
              }
            }
          }
        }
      }
      setPanel(aTab, panel, window);
      foundPanel = true;

      if (aTab.selected) {
        this.tabPanelShow(panel.id, changeSelectedTab = false);
      }
      if (this.selectedtPanel === panel) {
        unHideTab(aTab);
      } else if (!aTab.selected) {
        hideTab(aTab);
      }
    } else {
      let prvPanel = aTab.getAttribute("panel-id");

      if (prvPanel) {
        let panelExist = this.tabPanels.find(x => x.id.toString() === prvPanel);
        if (panelExist != null) {
          foundPanel = true;

          if (!findPanelInMenu(panelExist)) {
            addNewPanelInMenu(panelExist, checkIt = false);
          }
          setPanel(aTab, panelExist, window);
          if (this.selectedtPanel === panelExist) {
            unHideTab(aTab);
          } else if (!aTab.selected) {
            hideTab(aTab);
          }
        }
      }
    }

    if (foundPanel === false) {
      setPanel(aTab, this.selectedtPanel, window);
      unHideTab(aTab);
    }

    //Solo tab in window
    let soloTab = (window.gBrowser.tabs.length == 1) ? true : false;
    let restoredId = SessionStore.getCustomTabValue(aTab, "tree-id");
    if (!restoredId) {
      //Generate new unique id 
      let timeNow = (performance.now() + performance.timeOrigin).toFixed(3) * 1000;
      while (timeNow === this.lastId) timeNow = timeNow + 1;
      this.lastId = timeNow;
      setTabTreeID(aTab, timeNow.toString());
    } else {
      aTab.setAttribute("tree-id", restoredId);
    }
    let twistedRoot = SessionStore.getCustomTabValue(aTab, "twisted-root");
    if (twistedRoot) {
      aTab.setAttribute("twisted-root", true);
    }
    let hiddenChild = SessionStore.getCustomTabValue(aTab, "hidden-child");
    let hiddenChildRoot = SessionStore.getCustomTabValue(aTab, "hidden-child-rootID");
    if (hiddenChild && hiddenChildRoot) {
      aTab.setAttribute("hidden-child", true);
      aTab.setAttribute("hidden-child-rootID", hiddenChildRoot);
    }
    let treeDepth = SessionStore.getCustomTabValue(aTab, "tree-depth");
    if (treeDepth && !soloTab) {
      //add a fix for out of order restore
      aTab.setAttribute("tree-depth", treeDepth);
    } else {
      treeDepth = aTab.getAttribute("tree-depth");
      //Tab didn't depth initialized for some reason
      if (treeDepth == null) {
        treeDepth = this.initTreeDepth(aTab);
      }
      SessionStore.setCustomTabValue(aTab, "tree-depth", treeDepth.toString());
    }
    let openerId = SessionStore.getCustomTabValue(aTab, "opener-id");
    if (openerId) {
      aTab.setAttribute("opener-id", openerId);
    } else {
      if (aTab.openerTab != null && parseInt(treeDepth, 10) != 0) {
        setOpener(aTab, aTab.openerTab);
      }
    }
  },

  initTreeDepth: function(aTab) {
    this.attachTabListeners(aTab);
    let rootTab = aTab.openerTab;
    let uriString = aTab._fullLabel;
    //Find possible opener, if domain matches current tab
    if (rootTab == null && uriString) {
      let currentTab = window.gBrowser.selectedTab;
      let currentUrl = currentTab.linkedBrowser.currentURI.spec;
      if (compareDomains(currentUrl, uriString)) {
        aTab.openerTab = currentTab;
        rootTab = currentTab;
      }
    }
    if (isTab(aTab.previousSibling)) {
      let pTab = aTab.previousSibling;
      let nTab = aTab.nextSibling;
      //Move tabs that open under the hidden-tabs (not selected tab panel tabs)
      let nextNotHidden = (isTab(nTab) && !nTab.hasAttribute("tabPanel-hidden")) ?
        true : false;
      if (pTab.hasAttribute("tabPanel-hidden") && !nextNotHidden) {
        let newPosition = pTab;
        while (isTab(pTab) && pTab.hasAttribute("tabPanel-hidden")) {
          newPosition = pTab;
          pTab = getPreviousTab(pTab);
        }
        if (isTab(pTab)) {
          aTab.setAttribute("skipMoveForced", true);
          gBrowser.moveTabBefore(aTab, newPosition);
          aTab.removeAttribute("skipMoveForced");
        }
      }
    }

    let treeDepth = 0;
    if (rootTab != null && !rootTab.pinned && !rootTab.splitview) {
      let parentDepth = getTreeDepth(rootTab);
      if (parentDepth != null) {
        treeDepth = parentDepth + 1;
        let newPosition = getPositionUnderRoot(rootTab);
        aTab.setAttribute("skipMoveForced", true);
        //Move new tabs directly under parent
        if (this.moveNewTabsDirectlyUnderParent) {
          gBrowser.moveTabAfter(aTab, rootTab);
        } else {
          gBrowser.moveTabAfter(aTab, getLastInTree(rootTab));
        }
        aTab.removeAttribute("skipMoveForced");
      }
    }
    //Case when a zero depth tab spawns inside a tree
    else if (rootTab == null && isTab(aTab.previousSibling) && isTab(aTab.nextSibling)) {
      let previousTab = getPreviousTab(aTab);
      let nextTab = aTab.nextSibling;
      let nextDepth = getTreeDepth(nextTab);
      let prvDepth = getTreeDepth(previousTab);
      if (prvDepth != null && treeDepth <= prvDepth && nextDepth != null && (prvDepth <= nextDepth && nextDepth != 0)) {
        treeDepth = nextDepth;
      }
    }
    aTab.setAttribute("tree-depth", treeDepth);
    if (rootTab != null && rootTab.hasAttribute("twisted-root")) {
      this.toggleTwist(rootTab);
    }
    //will never get initialized otherwise
    // another approach?
    if (aTab.linkedBrowser && aTab.linkedBrowser.currentURI.spec.startsWith("about:")) {
      setTimeout(() => {
        if (!aTab.hasAttribute("tree-id")) {
          this.initTab(aTab);
        }
      }, 100);
    }
    return treeDepth;
  },

  observe: function(subject, topic, name) {
    if (topic == "nsPref:changed") {
      if (name === "browser.tabs.insertRelatedAfterCurrent") {
        nativeTreeTabs.moveNewTabsDirectlyUnderParent = Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent");
        return;
      }
      if (name === "treeTabs.behavior.lockCtrlTabInPanel") {
        nativeTreeTabs.lockCtrlTabInPanel = Services.prefs.getBoolPref("treeTabs.behavior.lockCtrlTabInPanel");
        return;
      }
      if (name === "treeTabs.behavior.switchSelectedOnClick") {
        nativeTreeTabs.switchSelectedOnClick = Services.prefs.getBoolPref("treeTabs.behavior.switchSelectedOnClick");
        return;
      }
      let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
        Ci.nsIStyleSheetService
      );
      styleSvc.unregisterSheet(nativeTreeTabs.customStyle, styleSvc.AUTHOR_SHEET);
      nativeTreeTabs.customStyle = loadNTTstyle();
    }
  },

  observeTab: function(target, nTT) {
    let tabObserver = new MutationObserver(function(mutations, observer) {
      mutations.forEach(function(mutation) {
        if (mutation.type === "attributes") {
          let man = mutation.attributeName;
          if (man === "pending" || man === "bursting" || man === "open") {
            observer.disconnect();
            nTT.initTab(mutation.target);
          }
        }
      });
    });
    tabObserver.observe(target, {
      subtree: false,
      childList: false,
      attributes: true,
    });
  },

  addTabGroupCreateListeners: function() {
    let groupPopup = document.getElementById("tab-group-editor").querySelector(["panel"]);
    if (groupPopup) {
      groupPopup.addEventListener("popupshowing", function(aEvent) {
        let panel = aEvent.target;
        let input = panel.querySelector("#tab-group-name");
        if (nativeTreeTabs.lastRightClickedTab) {
          let newTitle = nativeTreeTabs.lastRightClickedTab.label
          input.value = newTitle;
          nativeTreeTabs.lastRightClickedTab.group.label = newTitle;
        }
      }, true);
    }
    let tabContextMenu = document.getElementById("tabContextMenu");
    tabContextMenu.addEventListener("popupshowing", function(aEvent) {
      nativeTreeTabs.lastRightClickedTab = tabContextMenu.triggerNode.closest("tab");
    }, true);
  },

  prepareTabsForPanelMove: function(tabs) {

    let newArray = tabs.slice();
    tabs.forEach(function(cTab, index) {
      if (cTab.hasAttribute("twisted-root")) {
        let nextTab = cTab.nextSibling
        while (isTab(nextTab)) {
          if (nextTab.hasAttribute("hidden-child")) {
            if (!tabs.includes(nextTab)) {
              newArray.splice(index + 1 + (newArray.length - tabs.length), 0, nextTab);
            }
          } else {
            break;
          }
          nextTab = nextTab.nextSibling;
        }
      } else {
        this.tabLeaveStrip(cTab);
      }
    }, this);

    return newArray;
  },

  addDefaultPanel: function() {
    let panel0 = {
      "id": "0",
      "count": 0,
      "label": this.defaultPanelName,
      "selectedTab": null
    };
    this.tabPanels.push(panel0);
    this.selectedtPanel = panel0;
  },

  tabPanelOpen: function(tabs = null, label = null, id = null, forceShow = false, index = null) {
    let show = true;
    // if (tabs != null && !tabs.includes(window.gBrowser.selectedTab) && !forceShow) {
    //   show = false;
    // }
    let newPanelId;
    if (id != null) {
      id = id.toString();
      let panelExist = this.tabPanels.find(x => x.id.toString() === id);
      if (panelExist != null) {
        if (!findPanelInMenu(panelExist)) {
          addNewPanelInMenu(panelExist, checkIt = false);
        }
        return panelExist;
      }
      newPanelId = id;
    } else {
      newPanelId = getNextAvailableId(this.tabPanels);
    }
    //Hide other tabs
    if (show) {
      if (this.tabPanels.length === 1 && id == null) {
        gBrowser.tabs.forEach(function(aTab) {
          hideTab(aTab);
          setPanel(aTab, this.tabPanels[0], window);
        }, this);
      } else if (id == null) {
        gBrowser.tabs.forEach(function(aTab) {
          hideTab(aTab);
        }, this);
      }
    }

    let checkPanel = (id != null) ? false : true;

    if (this.tabPanels.length === 1 && this.tabPanels[0].count > 0) {
      if (!findPanelInMenu(this.tabPanels[0])) {
        addNewPanelInMenu(this.tabPanels[0], checkIt = !checkPanel);
      }
    }

    let newPanel = {
      "id": newPanelId,
      "count": 0,
      "label": (label != null) ? label : "New Panel",
    }

    this.tabPanels.push(newPanel);
    let position = (id != null) ? index : -1;
    addNewPanelInMenu(newPanel, checkIt = checkPanel, position);

    if (show && id == null) {
      this.changeSelectedPanel(newPanel);
    } else {
      checkPanelInMenu(window.nativeTreeTabs.selectedtPanel);
    }

    if (tabs != null && tabs.length > 0) {
      //Move tabs to the new panel
      tabs = this.prepareTabsForPanelMove(tabs);
      let lastTab = gBrowser.tabs[gBrowser.tabs.length - 1];
      nativeTreeTabs.moveTabsAfter(tabs, lastTab);
      let saveSelectedTab;
      if (tabs.includes(window.gBrowser.selectedTab)) {
        //save in case of last panel closing
        // which will change the selected tab
        saveSelectedTab = window.gBrowser.selectedTab;
      }
      tabs.forEach(function(cTab) {
        //Special Case
        if (cTab === lastTab) {
          setTreeDepth(cTab, 0);
          removeOpener(cTab);
        }
        if (show) {
          unHideTab(cTab);
        } else {
          hideTab(cTab);
        }
        setPanel(cTab, newPanel, window);
      }, this);
      if (show) {
        if (saveSelectedTab != null) {
          window.gBrowser.selectedTab = saveSelectedTab;
        }
        if (tabs.includes(window.gBrowser.selectedTab)) {
          window.gBrowser.selectedTabs = window.gBrowser.selectedTab;
        } else {
          window.gBrowser.selectedTabs = tabs[0];
          window.gBrowser.selectedTab = tabs[0];
        }
      }
    } else if (id == null) {
      //Open new tab for the new panel
      let newTab = window.gBrowser.addTab(
        window.BROWSER_NEW_TAB_URL, {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        }
      );
      if (!newTab) {
        throw new Error("Could not open new tab.");
      }
      setPanel(newTab, newPanel, window);
      window.gBrowser.selectedTab = newTab;
    }
    return newPanel;
  },

  filterGroups: function(tabs) {
    //Extract groups from the array
    // remove the individual tabs
    // and add the group element
    // if the whole group is set to move
    let checkedGroups = new Set();
    let addedGroups = new Set();

    let result = [];
    let includesAll = (arr, target) => target.every(v => arr.includes(v));
    for (const aTab of tabs) {
      let skip = false;
      if (aTab.group) {
        if (!addedGroups.has(aTab.group.id)) {
          if (!checkedGroups.has(aTab.group.id) && includesAll(tabs, aTab.group.tabs)) {
            result.push(aTab.group);
            addedGroups.add(aTab.group.id);
            skip = true;
          } else {
            checkedGroups.add(aTab.group.id);
          }
        } else {
          skip = true;
        }
      }
      if (skip === false) {
        result.push(aTab);
      }
    }
    return result;
  },

  moveTabsAfter: function(tabs, position) {
    gBrowser.moveTabsAfter(this.filterGroups(tabs), position);
  },

  moveTabsBefore: function(tabs, position) {
    gBrowser.moveTabsBefore(this.filterGroups(tabs), position);
  },

  movePanel: function(panelId, beforePanelId) {
    panelId = panelId.toString();
    let panel = this.tabPanels.find(x => x.id.toString() === panelId);
    if (!panel) {
      return;
    }
    let position;
    let beforePanel;
    if (beforePanelId != null) {
      beforePanelId = beforePanelId.toString();
      beforePanel = this.tabPanels.find(x => x.id.toString() === beforePanelId);
      if (!beforePanel) {
        return;
      }
      //first tab of the before panel
      let pTab = gBrowser.tabs.find(aTab => aTab.hasAttribute("panel-id") && aTab.getAttribute("panel-id") === beforePanelId);
      if (!isTab(pTab)) {
        return;
      }
      position = pTab;
    }

    let tabsToMove = new Array();

    gBrowser.tabs.forEach(function(aTab) {
      if (aTab.hasAttribute("panel-id")) {
        if (aTab.getAttribute("panel-id") === panelId && !aTab.pinned) {
          tabsToMove.push(aTab);
          aTab.setAttribute("skipMoveForced", "true");
        }
      }
    }, this);

    //Change panel position in panel array and move tabs
    if (position != null) {
      let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
      let indexOfBeforePanel = nativeTreeTabs.tabPanels.indexOf(beforePanel);
      //downwards move
      if (indexOfBeforePanel > indexOfPanel) {
        indexOfBeforePanel = indexOfBeforePanel - 1;
      }
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, indexOfBeforePanel);
      nativeTreeTabs.moveTabsBefore(tabsToMove, position);

    } else {
      let lastIndex = nativeTreeTabs.tabPanels.length - 1;
      let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, lastIndex);
      nativeTreeTabs.moveTabsAfter(tabsToMove, gBrowser.tabs[gBrowser.tabs.length - 1]);
    }
    tabsToMove.forEach(function(cTab) {
      cTab.removeAttribute("skipMoveForced");
    }, this);
  },

  tabPanelShow: function(panelId, changeSelectedTab = true) {
    panelId = panelId.toString();
    let panel = this.tabPanels.find(x => x.id.toString() === panelId);
    if (!panel) {
      return;
    }
    // The first tab of the panel
    let panelTopTab = null;
    panelId = panelId.toString();
    this.changeSelectedPanel(panel);

    //Hide other panels tabs, show this panel tabs
    gBrowser.tabs.forEach(function(aTab) {
      if (aTab.hasAttribute("panel-id")) {
        if (aTab.getAttribute("panel-id") === panelId) {
          if (panelTopTab == null) {
            panelTopTab = aTab;
          }
          unHideTab(aTab);
        } else {
          hideTab(aTab);
        }
      }
    }, this);

    if (changeSelectedTab) {
      //Show the last selected tab of the panel if it exists
      // else show the first (top) tab of the panel
      let panelSelectedTab = panel.selectedTab;
      if (panelSelectedTab && window.gBrowser.tabs.indexOf(panelSelectedTab) != -1 &&
        panelSelectedTab.getAttribute("panel-id") === panelId) {
        window.gBrowser.selectedTab = panelSelectedTab;
      } else if (panelTopTab != null) {
        window.gBrowser.selectedTab = panelTopTab;
      }
    }
  },

  moveTabsToPanel: function(tabsToMove, panel, forceShow = false) {
    panelId = panel.id.toString();
    let lastTab = gBrowser.tabs[gBrowser.tabs.length - 1];
    let previousTab = lastTab;
    let found = false;
    //Find panel position in the tab strip [panel1 tabs][panel2 tabs][panel3 tabs]...
    while (isTab(previousTab)) {
      if (previousTab.hasAttribute("panel-id") && previousTab.getAttribute("panel-id") === panelId) {
        found = true;
        break;
      }
      previousTab = getPreviousTab(previousTab);
    }
    if (found) {
      tabsToMove = this.prepareTabsForPanelMove(tabsToMove);
      //Force select the new panel when switching
      // if the selected tab is set to move
      // Check before setting the panel, because 
      // the selected tab might change (if the panel closes)
      let saveSelectedTab;
      if (tabsToMove.includes(gBrowser.selectedTab)) {
        saveSelectedTab = gBrowser.selectedTab;
      }
      nativeTreeTabs.moveTabsAfter(tabsToMove, previousTab);
      tabsToMove.forEach(function(cTab) {
        setPanel(cTab, panel, window);
      }, this);
      if (saveSelectedTab != null) {
        gBrowser.selectedTab = saveSelectedTab;
      }
      if (forceShow || tabsToMove.includes(gBrowser.selectedTab)) {
        this.tabPanelShow(panelId, changeSelectedTab = false);
        if (!tabsToMove.includes(gBrowser.selectedTab)) {
          gBrowser.selectedTabs = tabsToMove[0];
          gBrowser.selectedTab = tabsToMove[0];
        } else {
          window.gBrowser.selectedTabs = window.gBrowser.selectedTab;
        }
      } else {
        tabsToMove.forEach(function(cTab) {
          hideTab(cTab);
        }, this);
        window.gBrowser.selectedTabs = window.gBrowser.selectedTab;
      }
    }
  },

  panelIncreaseCount: function(panel) {
    if (!panel) {
      return;
    }
    panel.count++;
  },

  panelDecreaseCount: function(panelId, aTab = null) {
    panelId = panelId.toString();
    let panel = this.tabPanels.find(x => x.id.toString() === panelId);
    if (!panel) {
      return;
    }
    if (panel.count === 1) {
      //Remove panel with zero tabs
      this.tabPanels.splice(this.tabPanels.indexOf(panel), 1);
      removePanelFromMenu(panelId);
      if (this.tabPanels.length > 0 && this.selectedtPanel.id.toString() === panelId) {
        if (this.previousSelectedPanel != null) {
          if (aTab != null) {
            aTab.owner = null;
          }
          this.tabPanelShow(this.previousSelectedPanel.id);
        }
      } else if (this.tabPanels.length === 0) {
        //No panels left? when  does this happen?
        this.addDefaultPanel();
      }
    } else {
      panel.count--;
    }
  },

  replaceTabsPanelLabel: function(panel) {
    let panelId = panel.id.toString();
    let label = panel.label.toString();
    //Replace tabs saved panel label
    gBrowser.tabs.forEach(function(aTab) {
      if (aTab.hasAttribute("panel-id") && aTab.getAttribute("panel-id") === panelId) {
        aTab.setAttribute("panel-label", panel.label);
        SessionStore.setCustomTabValue(aTab, "panel-label", panel.label);
      }
    }, this);
    if (panelId === "0") {
      Services.prefs.setStringPref("treeTabs.defaultPanelName", label);
    }
  },

  changeSelectedPanel: function(panel) {
    let panelId = panel.id.toString();
    if (this.selectedtPanel.id.toString() === panelId) {
      checkPanelInMenu(panel);
      return;
    }
    if (this.tabPanels.includes(this.selectedtPanel)) {
      this.previousSelectedPanel = this.selectedtPanel;
    }
    this.selectedtPanel = panel;
    checkPanelInMenu(panel);
  }
};

//Wait until browser is ready to initialize
if (gBrowserInit.delayedStartupFinished) {
  nativeTreeTabs.init();
} else {
  let delayedListener = (subject, topic) => {
    if (topic == "browser-delayed-startup-finished" && subject == window) {
      Services.obs.removeObserver(delayedListener, topic);
      nativeTreeTabs.init();
    }
  };
  Services.obs.addObserver(delayedListener, "browser-delayed-startup-finished");
};

/*==============================*/
/*       Tab functions         */
/*==============================*/
getNextTab = function(aTab) {

  if (aTab == null) {
    return;
  }

  let nextTab = aTab.nextSibling;

  if (aTab.group) {
    if (aTab.group.tabs.indexOf(aTab) === aTab.group.tabs.length - 1) {
      nextTab = aTab.group.nextSibling;
    }
  }
  if (nextTab && nextTab.tagName === "tab-group") {
    nextTab = nextTab.tabs[0];
  }

  while (nextTab && (nextTab.splitview || nextTab.splitViewId)) {
    if (!isTab(nextTab) && nextTab.tagName != "tab-split-view-wrapper") return null;
    nextTab = nextTab.nextSibling;
  }
  if (nextTab && nextTab.splitview) return null;
  if (!isTab(nextTab)) return null;
  return nextTab;
}

getPreviousTab = function(aTab) {

  if (aTab == null) {
    return;
  }

  let previousTab = aTab.previousSibling;

  if (aTab.group) {
    if (aTab.group.tabs.indexOf(aTab) === 0) {
      previousTab = aTab.group.previousSibling;
    }
  }
  if (previousTab && previousTab.tagName === "tab-group") {
    previousTab = previousTab.tabs[previousTab.tabs.length - 1];
  }
  while (previousTab && (previousTab.splitview || previousTab.splitViewId)) {
    if (!isTab(previousTab) && previousTab.tagName != "tab-split-view-wrapper") return null;
    previousTab = previousTab.previousSibling;
  }
  if (previousTab && previousTab.splitview) return null;
  if (!isTab(previousTab)) return null;
  return previousTab;
}

setTabTreeID = function(aTab, id) {
  id = id.toString();
  aTab.setAttribute("tree-id", id);
  SessionStore.setCustomTabValue(aTab, "tree-id", id);
}

setTreeDepth = function(aTab, depth) {
  depth = depth.toString();
  aTab.setAttribute("tree-depth", depth);
  SessionStore.setCustomTabValue(aTab, "tree-depth", depth);
}

getTreeDepth = function(aTab) {
  let depthLevel = aTab.getAttribute("tree-depth");
  if (depthLevel != null) {
    return parseInt(depthLevel, 10);
  }
  return null;
}

setPanelLite = function(aTab, panel, window) {
  panelId = panel.id.toString();
  aTab.setAttribute("panel-id", panelId);
  window.nativeTreeTabs.panelIncreaseCount(panel);
}

setPanel = function(aTab, panel, window) {
  panelId = panel.id.toString();
  let decrease = false;
  let previousPanel;

  SessionStore.setCustomTabValue(aTab, "panel-id", panelId);
  SessionStore.setCustomTabValue(aTab, "panel-label", panel.label.toString());

  if (aTab.hasAttribute("panel-id")) {
    previousPanel = aTab.getAttribute("panel-id");
    if (previousPanel === panelId) {
      return;
    } else {
      decrease = true;
    }
  }

  aTab.setAttribute("panel-id", panelId);
  window.nativeTreeTabs.panelIncreaseCount(panel);
  if (decrease) {
    window.nativeTreeTabs.panelDecreaseCount(previousPanel);
  }
}

hideTab = function(aTab, panelId) {
  if (aTab.group) {
    aTab.group.tabs.forEach(function(cTab) {
      cTab.setAttribute("tabPanel-hidden", true);
      SessionStore.setCustomTabValue(cTab, "tabPanel-hidden", "true");
    });
  } else {
    aTab.setAttribute("tabPanel-hidden", true);
    SessionStore.setCustomTabValue(aTab, "tabPanel-hidden", "true");
  }
}

unHideTab = function(aTab, panelId) {
  if (aTab.group) {
    aTab.group.tabs.forEach(function(cTab) {
      cTab.removeAttribute("tabPanel-hidden");
      SessionStore.deleteCustomTabValue(cTab, "tabPanel-hidden");
    });
  } else {
    aTab.removeAttribute("tabPanel-hidden");
    SessionStore.deleteCustomTabValue(aTab, "tabPanel-hidden");
  }
}
setOpener = function(aTab, openerTab) {
  if (openerTab == null) {
    removeOpener(aTab);
    return;
  }
  let openerId = openerTab.getAttribute("tree-id");
  if (openerId) {
    aTab.openerTab = openerTab;
    SessionStore.setCustomTabValue(aTab, "opener-id", openerId.toString());
    aTab.setAttribute("opener-id", openerId);
  }
}

copyOpener = function(aTab, originTab) {
  if (originTab == null) return;
  let openerId = originTab.getAttribute("opener-id");
  if (openerId) {
    //Why not use setOpener Here?
    //In case of openerTab and  opener-id mismatch?
    aTab.openerTab = originTab.openerTab;
    SessionStore.setCustomTabValue(aTab, "opener-id", openerId.toString());
    aTab.setAttribute("opener-id", openerId);
  } else {
    removeOpener(aTab);
  }
}

removeOpener = function(aTab) {
  aTab.openerTab = null;
  aTab.removeAttribute("opener-id");
  SessionStore.deleteCustomTabValue(aTab, "opener-id");
}

isHidden = function(aTab) {
  if (aTab.hasAttribute("hidden-child") || aTab.hasAttribute("tabPanel-hidden"))
    return true;
  return false;
}

setDomainAttr = function(aTab) {
  if (!isTab(aTab)) return;
  let linkedBrowser = aTab.linkedBrowser;
  if (linkedBrowser == null) return;
  let uri = aTab.linkedBrowser.currentURI;
  let spec = uri.spec;
  let bakedPatterns = ["about", "resource", "chrome", "wyciwyg", "file", "blob", "moz-extension", "jar"];
  let baked = bakedPatterns.some(p => spec.startsWith(p));
  try {
    if (baked) {
      aTab.setAttribute("domain", spec.split(":")[0]);
    } else {
      let host = uri.host.replace("www.", "");
      aTab.setAttribute("domain", host);
    }
  } catch (error) {
    console.error(error);
    console.log(spec);
  }
}

function compareDomains(url1, url2) {
  // Remove protocol
  let matchPattern = /([a-z0-9-]+\.[a-z]{2,})(?:\/|$)/i;
  let url1Match = url1.match(matchPattern);
  if (url1Match) {
    let url2Match = url2.match(matchPattern);
    if (url2Match && url1Match[1] === url2Match[1]) return true;
  }
  return false;
}

/*==============================*/
/*       Tree functions         */
/*==============================*/
getPositionUnderRoot = function(rootTab) {
  let newPosition = rootTab._tPos + 1;
  return newPosition;
}

getClosestZeroDepthTab = function(aTab, direction) {
  let getFollowingTab = getNextTab;
  if (direction == "up") getFollowingTab = getPreviousTab;
  let followingTab = getFollowingTab(aTab);
  while (followingTab) {
    followingTabTreeDepth = getTreeDepth(followingTab);
    if (followingTabTreeDepth == null || followingTabTreeDepth == 0) {
      return followingTab;
    }
    followingTab = getFollowingTab(followingTab);
  }
  return null;
}

getRootTab = function(aTab) {
  let aTabDepth = getTreeDepth(aTab);
  if (aTabDepth == 0) return null;
  let previousTab = aTab.previousSibling;
  while (isTab(previousTab)) {
    if (getTreeDepth(previousTab) < aTabDepth) {
      return previousTab;
    }
    previousTab = previousTab.previousSibling;
  }
  return null;
}

getLastInTree = function(aTab) {
  let aTabDepth = getTreeDepth(aTab);
  let nextTab = aTab.nextSibling;
  let toReturn = aTab;
  while (isTab(nextTab)) {
    if (getTreeDepth(nextTab) > aTabDepth) {
      toReturn = nextTab;
      nextTab = nextTab.nextSibling;
    } else {
      break;
    }
  }
  return toReturn;
}

removeTreeOutline = function(index, aTab) {
  let nextTab = gBrowser.tabs[index];
  let count = 0;
  while (nextTab) {
    let outlineStyle = nextTab.querySelector(".tab-background");
    if (outlineStyle == null) return count;
    outlineStyle = outlineStyle.style.outline.toString();
    if (nextTab != aTab && (outlineStyle != "red solid 1px" || nextTab.splitview)) break;
    nextTab.querySelector(".tab-background").style.outline = "";
    count = count++;
    nextTab = getNextTab(nextTab);
  }
  return count;
}

outlineTree = function(aTab, outlineToggle) {
  let treeDepth = getTreeDepth(aTab);
  let nextTab = getNextTab(aTab);
  while (nextTab) {
    nextTabTreeDepth = getTreeDepth(nextTab);
    if (nextTabTreeDepth == null || nextTabTreeDepth <= treeDepth) {
      break;
    }
    if (outlineToggle) nextTab.querySelector(".tab-background").style.outline = "red solid 1px";
    else nextTab.querySelector(".tab-background").style.outline = "";
    nextTab = getNextTab(nextTab);
  }
}

checkInsideMove = function(rootTab, nextTab, rootlDepth) {
  while (isTab(nextTab)) {
    while (nextTab && nextTab.multiselected) {
      nextTab = nextTab.nextSibling;
    }
    nextTabTreeDepth = getTreeDepth(nextTab);
    if (rootTab != nextTab) {
      if (nextTabTreeDepth == null || nextTabTreeDepth <= rootlDepth) {
        break;
      }
    }

    if (rootTab.multiselected)
      toCheck = nextTab;
    else
      //previousSibling is used because 
      //moving at the end of the tree is allowed
      toCheck = nextTab.previousSibling;

    if (toCheck === rootTab) {
      return false;
    }
    nextTab = nextTab.nextSibling;
  }
  return true;
}
//_________________

function moveItemInTheArray(arr, fromIndex, toIndex) {
  var element = arr[fromIndex];
  arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, element);
}

getNextAvailableId = function(array) {
  let id = (performance.now() + performance.timeOrigin).toFixed(3) * 1000;
  while (array.find(obj => obj.id.toString() === id.toString())) {
    id++;
  }
  return id.toString();
}

function getNameFromInput(input, panel) {
  let name = input.value.trim();
  if (name && name != '') {
    panel.label = name;
  }
}

function closePopupAfter(popup) {
  if (popup == null) {
    return;
  }
  popup._stayOpen = false;
  popup.style.display = "none";
  setTimeout(() => {
    popup.style.display = "";
  }, 10);
}

function addInputListeners(input, enterAction, escapeAction, blurAction, popup = null) {
  input.addEventListener("keydown", (aEvent) => {
    if (aEvent.key === "Enter") {
      enterAction();
      closePopupAfter(popup);
    } else if (aEvent.key === "Escape") {
      escapeAction();
      closePopupAfter(popup);
    }
  });
  setTimeout(() => {
    input.focus();
    input.select();
    input.addEventListener("blur", () => {
      blurAction();
      closePopupAfter(popup);
    });
  }, 5);
}

function createInput(target, replace = false, value = '', placeholder = '', width = null,
  minWidth = null, minHeight = null, textAlign = null, fontSize = null, color = null,
  padding = null, outline = null, ) {

  let input = document.createElement("input");
  input.setAttribute("type", "text");
  input.setAttribute("value", value);
  input.setAttribute("placeholder", placeholder);
  input.style.background = "transparent";
  input.style.border = "none";
  input.style.width = width;
  input.style.minWidth = minWidth;
  input.style.minHeight = minHeight;
  input.style.textAlign = textAlign;
  input.style.fontSize = fontSize;
  input.style.color = color;
  input.style.padding = padding;
  input.style.outline = outline;

  if (replace) {
    target.parentNode.replaceChild(input, target);
  } else {
    target.parentNode.insertBefore(input, target);
  }
  input.focus();
  input.select();

  return input;
}

panelNameRightClick = function(aEvent) {
  if (aEvent) {
    aEvent.preventDefault();
  }
  let tabPanelName = document.querySelector('#tab-panels-name');
  if (!tabPanelName) {
    return;
  }
  let panel = window.nativeTreeTabs.selectedtPanel;
  let prvWidth = getComputedStyle(tabPanelName).getPropertyValue("width");
  let input = createInput(tabPanelName, replace = true, value = panel.label, placeholder = '', width = prvWidth,
    minWidth = "50%", minHeight = null, textAlign = null, fontSize = null, color = null,
    padding = null, outline = "none!important");

  function replaceInputWithNew() {
    tabPanelName.innerText = panel.label;
    let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
    let p = tabContextMenupopup.querySelector("#moveTo-panel-" + panel.id.toString());
    if (p) {
      p.setAttribute("label", "" + panel.label);
    }
    input.parentNode.replaceChild(tabPanelName, input);
    updateCountInMenu(panel);
    window.nativeTreeTabs.replaceTabsPanelLabel(panel);
  }

  function finishEdit() {
    getNameFromInput(input, panel)
    replaceInputWithNew();
  }
  addInputListeners(input, finishEdit, replaceInputWithNew, finishEdit);
}

menuItemRightClick = function(aEvent, panel, target) {
  let button = aEvent.button;
  if (button == 1 || button == 0) {
    return;
  }
  aEvent.preventDefault();
  let popupView = document.getElementById('tab-panels-menupopup-view');
  //Disallow two renames at the same time
  if (popupView.querySelector("input")) {
    return;
  }
  let menupopup = document.getElementById('tab-panels-menupopup');
  menupopup._stayOpen = true;
  let prvWidth = getComputedStyle(target).getPropertyValue("width");
  let input = createInput(target, replace = false, value = panel.label, placeholder = '', width = prvWidth,
    minWidth = null, minHeight = "25px", textAlign = "center", fontSize = "13px", color = null,
    padding = "4px", outline = null);
  target.style.display = "none";

  function replaceInputWithNew() {
    target.label = panel.label;
    target.style.display = "";
    let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
    let p = tabContextMenupopup.querySelector("#moveTo-panel-" + panel.id.toString());
    if (p) {
      p.setAttribute("label", "" + panel.label);
    }
    input.parentNode.removeChild(input);
    if (window.nativeTreeTabs.selectedtPanel === panel) {
      let tabPanelName = document.querySelector('#tab-panels-name');
      if (tabPanelName != null) {
        tabPanelName.innerText = panel.label;
      }
    }
    updateCountInMenu(panel);
    window.nativeTreeTabs.replaceTabsPanelLabel(panel);
  }

  function escapeKey() {
    target.style.display = "";
    input.parentNode.removeChild(input);
  }

  function finishEdit() {
    getNameFromInput(input, panel)
    replaceInputWithNew();
  }
  addInputListeners(input, finishEdit, replaceInputWithNew, escapeKey, popup = menupopup);
}

menuItemClick = function(panel, target) {
  nativeTreeTabs.tabPanelShow(panel.id);
}

makePopupStayOpen = function(popup, action) {
  if (!popup) {
    return;
  }
  popup.addEventListener("popuphiding", function(aEvent) {
    if (action) {
      action();
    }
    if (popup._stayOpen) {
      aEvent.preventDefault();
      aEvent.stopImmediatePropagation();
      popup._stayOpen = false;
      return false;
    }
  }, true);
}

addNewPanelInput = function(aEvent, menupopup) {
  //Disallow adding new when renaming
  let popupView = document.getElementById('tab-panels-menupopup-view');
  if (popupView.querySelector("input")) {
    return;
  }
  menupopup._stayOpen = true;
  let addNewButon = menupopup.querySelector(".add-panel-button");
  let input = createInput(addNewButon, replace = false, value = '', placeholder = "Enter name...", width = null,
    minWidth = null, minHeight = "25px", textAlign = "center", fontSize = null, color = "var(--toolbox-textcolor, var(--toolbox-text-color))",
    padding = "4px", outline = null, );

  function lostFocus() {
    let name = input.value.trim();
    if (!name) {
      input.parentNode.removeChild(input);
      return;
    }
    input.parentNode.removeChild(input);
    window.nativeTreeTabs.tabPanelOpen(tabs = null, label = name)
  }

  function finishEdit() {
    let name = input.value.trim();
    if (name === "") {
      name = null;
    }
    input.parentNode.removeChild(input);
    window.nativeTreeTabs.tabPanelOpen(tabs = null, label = name);
  }

  addInputListeners(input, finishEdit, () => {
    input.parentNode.removeChild(input)
  }, lostFocus, popup = menupopup);
}

addNewPanelInMenu = function(panel, checkIt = false, position = -1) {
  let menuitem = document.createXULElement('menuitem');
  menuitem.setAttribute('panel-id', panel.id);
  menuitem.setAttribute('label', panel.label);
  menuitem.setAttribute('type', 'radio');
  menuitem.setAttribute("draggable", "true");

  menuitem.addEventListener("command", (aEvent) => menuItemClick(panel, aEvent.target));
  menuitem.addEventListener("click", (aEvent) => menuItemRightClick(aEvent, panel, aEvent.target));

  let menupopup = document.getElementById('tab-panels-menupopup-view');
  //Put it in the right position
  //Move it in the panel array too
  if (menupopup) {
    if (position === -1) {
      menupopup.appendChild(menuitem);
    } else if (position == null) {
      //first place
      let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, 0);
      menupopup.firstChild.after(menuitem);
    } else {
      let prevItem = menupopup.querySelector('[panel-id="' + position.toString() + '"]');
      if (prevItem) {
        //already added to tabPanels so indexes differ in the menu by + 1
        // no need to add it because menu first child is start button so indexes
        // of menu are +1 always
        let itemIndex = Array.prototype.indexOf.call(menupopup.children, prevItem);
        let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
        //downards move
        // if (itemIndex >  indexOfPanel){
        //   indexOfBeforePanel = indexOfBeforePanel - 1; 
        // }
        prevItem.after(menuitem);
      } else {
        menupopup.appendChild(menuitem);
      }
    }
  } else {
    // addTabPanelButton();
  }
  if (checkIt) {
    menuitem.setAttribute("checked", "");
  }
  let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
  addMenuItem(tabContextMenupopup, "" + panel.label, (aTab, aEvent) => {
    let forceShow = (aEvent.ctrlKey) ? true : false;
    let tabs = (TabContextMenu.contextTab.multiselected) ?
      gBrowser.selectedTabs : [TabContextMenu.contextTab];
    window.nativeTreeTabs.moveTabsToPanel(tabs, panel, forceShow);
  }, isToggle = false, id = "moveTo-panel-" + panel.id.toString());

  updateCountInMenu(panel);
}

updateCountInMenu = function(panel) {
  let menupopup = document.getElementById('tab-panels-menupopup-view');
  if (menupopup != null) {
    let menuitem = menupopup.querySelector('[panel-id="' + panel.id + '"]');
    if (menuitem != null) {
      let string = panel.label;
      if (string.length > 30) {
        string = string.substring(0, 30) + "...";
      }
      menuitem.setAttribute('label', string + " (" + panel.count + ")");
      menuitem.setAttribute('title', panel.label);
    }
  }
}

removePanelFromMenu = function(panelId) {
  let menupopup = document.getElementById('tab-panels-menupopup-view');
  if (menupopup == null) {
    return;
  }
  let menuitem = menupopup.querySelector('[panel-id="' + panelId + '"]');
  if (menuitem) {
    menupopup.removeChild(menuitem);
  }
  let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
  if (tabContextMenupopup != null) {
    let p = tabContextMenupopup.querySelector("#moveTo-panel-" + panelId.toString());
    //Timeout exists so context item which removes itself won't get stuck
    setTimeout(() => {
      if (p)
        tabContextMenupopup.removeChild(p);
    }, 10);
  }
}

findPanelInMenu = function(panel) {
  let menupopup = document.getElementById('tab-panels-menupopup-view');
  if (menupopup != null) {
    let menuitem = menupopup.querySelector('[panel-id="' + panel.id.toString() + '"]');
    if (menuitem) {
      return true;
    }
  }
  return false;
}

checkPanelInMenu = function(panel) {
  let menupopup = document.getElementById('tab-panels-menupopup-view');
  if (menupopup != null) {
    let menuitem = menupopup.querySelector('[panel-id="' + panel.id.toString() + '"]');
    if (menuitem) {
      menupopup.childNodes.forEach(function(item) {
        item.removeAttribute("checked");
      });
      menuitem.setAttribute("checked", "");
    }
  }
  let tabPanelName = document.querySelector('#tab-panels-name');
  if (tabPanelName != null) {
    tabPanelName.innerText = panel.label;
  }
  let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
  if (tabContextMenupopup == null) {
    return;
  }
  let p = tabContextMenupopup.querySelector("#moveTo-panel-" + panel.id.toString());
  for (let i = 0, len = tabContextMenupopup.childElementCount; i < len; ++i) {
    tabContextMenupopup.children[i].disabled = false;
  }
  if (p) {
    p.disabled = true;
  }
}

addMenuItem = function(parentPopup, label, action, isToggle = false, id = null) {
  let item = document.createXULElement("menuitem");
  item.setAttribute("label", label);
  if (id != null) {
    item.setAttribute("id", id);
  }
  // item.setAttribute("accesskey", accesskey);
  if (isToggle) {
    item.setAttribute("type", "checkbox");
  }
  item.addEventListener("command", (aEvent) => {
    let aTab = TabContextMenu.contextTab || gBrowser.selectedTab;
    if (aTab) {
      aEvent.stopPropagation();
      aEvent.preventDefault();
      action(aTab, aEvent);
    }
  });
  parentPopup.appendChild(item);
  return item;
}

addItemInTabContextMenu = function() {
  let tabContextMenu = document.getElementById("tabContextMenu");
  if (!tabContextMenu) return;

  let separator = document.createXULElement("menuseparator");
  separator.setAttribute("id", "custom-tab-submenu-separator");

  tabContextMenu.appendChild(separator);

  let submenu = document.createXULElement("menu");
  submenu.setAttribute("id", "custom-tab-submenu");
  submenu.setAttribute("label", "Move to Panel...");
  submenu.setAttribute("accesskey", "a");

  let menupopup = document.createXULElement("menupopup");
  menupopup.setAttribute("id", "tab-context-panel-actions");

  addMenuItem(menupopup, "Create New Panel", (aTab, aEvent) => {
    let forceShow = (aEvent.ctrlKey) ? true : false;
    let tabs = (TabContextMenu.contextTab.multiselected) ?
      gBrowser.selectedTabs : [TabContextMenu.contextTab];
    window.nativeTreeTabs.tabPanelOpen(tabs, label = null, id = null, forceShow);
    panelNameRightClick();
  }, isToggle = false, id = "tab-context-create-new-panel");
  //Insert before tab Group entry
  submenu.appendChild(menupopup);
  let context_moveTabToGroup = document.getElementById("context_moveTabToGroup");
  if (context_moveTabToGroup) {
    tabContextMenu.insertBefore(submenu, context_moveTabToGroup.nextSibling);
  }
}

addTabPanelButton = function() {
  //Add new tab context menu option
  addItemInTabContextMenu();
  //Create Button
  let tabPanelGroup = document.createElement("div");
  tabPanelGroup.setAttribute("id", "tab-panels-group");

  let tabPanelName = document.createElement("h1");
  tabPanelName.setAttribute("id", "tab-panels-name");
  // tabPanelName.setAttribute("class", "tab-panel tools-overflow");
  tabPanelName.innerText = nativeTreeTabs.defaultPanelName;

  let dropDownImg = document.createElement("div");
  dropDownImg.setAttribute("class", "dropdown-arrow");

  let tabPanelButton = document.createElement("div");
  tabPanelButton.setAttribute("id", "tab-panels-button");
  tabPanelButton.setAttribute("class", "tab-panel tools-overflow");
  tabPanelButton.setAttribute("type", "icon ghost");
  tabPanelButton.setAttribute("size", "default");
  tabPanelButton.setAttribute("label", "Tab Panels");
  tabPanelButton.setAttribute("tooltiptext", "Open Panels");

  let buttonBackground = document.createElement("div");
  buttonBackground.setAttribute("class", "button-background");
  tabPanelButton.appendChild(buttonBackground);

  let buttonImage = document.createElement("img");

  buttonBackground.appendChild(buttonImage);
  tabPanelGroup.appendChild(tabPanelButton);
  tabPanelGroup.appendChild(tabPanelName);
  tabPanelGroup.appendChild(dropDownImg);
  //Insert on top of sidebar
  let sidebarMain = document.querySelector(["sidebar-main"]);
  sidebarMain.parentNode.insertBefore(tabPanelGroup, sidebarMain);
  //Create popup
  let menupopup = document.createXULElement('panel');
  menupopup.setAttribute('id', 'tab-panels-menupopup');
  menupopup.setAttribute('type', 'arrow');
  menupopup.setAttribute('class', 'panel-no-padding');
  menupopup.setAttribute('orient', 'vertical');
  menupopup.setAttribute('position', 'after_start');

  let mainDiv = document.createElement('div');
  mainDiv.setAttribute('id', 'tab-panels-menupopup-view');

  let subDiv = document.createElement('div');
  subDiv.setAttribute('class', 'add-panel-button');
  // menupopup.setAttribute('onpopupshowing', null);

  document.getElementById('mainPopupSet').appendChild(menupopup);

  let plusIcon = document.createElement('img');
  let menuitem = document.createXULElement('menuitem');
  menuitem.setAttribute('id', 'add-panel-button-menuitem');

  menuitem.setAttribute('label', 'Create a New Panel');

  subDiv.appendChild(plusIcon);
  subDiv.appendChild(menuitem);
  mainDiv.appendChild(subDiv);
  menupopup.appendChild(mainDiv);

  subDiv.addEventListener("click", (aEvent) => addNewPanelInput(aEvent, menupopup));

  let isDragging = false;
  let draggedItem = null;
  let previousNextitem = null;
  let helddown = 0;
  let dragStartPos;
  mainDiv.addEventListener("mousedown", (aEvent) => {
    aEvent.preventDefault();
    let item = aEvent.target.closest("#tab-panels-menupopup-view > menuitem");
    if (item) {
      helddown = 0;
      isDragging = true;
      draggedItem = item;
      dragStartPos = Array.prototype.indexOf.call(item.parentNode.children, item) - 1;
      let containerOffsetY = draggedItem.offsetTop / 2;
      draggedItem.classList.add("dragging");
      draggedItem.style.top = containerOffsetY + "px";
      draggedItem.style.background = "rgba(40,150,255,0.9)";
      document.addEventListener("mousemove", handleMousemove);
      document.addEventListener("mouseup", handleMouseUp);
    }
  });

  handleMousemove = function(aEvent) {
    if (isDragging && draggedItem) {
      helddown++;
      let itemSibilings = Array.from(mainDiv.querySelectorAll("#tab-panels-menupopup-view > menuitem:not(.dragging)"));
      let nextItem = itemSibilings.find((sibiling) => {
        return (
          aEvent.clientY - mainDiv.getBoundingClientRect().top <=
          sibiling.offsetTop + sibiling.offsetHeight / 2
        );
      });
      if (previousNextitem) {
        previousNextitem.style.marginTop = "";
      }
      if (nextItem) {
        nextItem.style.marginTop = "5px";
        previousNextitem = nextItem;
      }
      mainDiv.insertBefore(draggedItem, nextItem);
    } else {
      document.removeEventListener("mousemove", handleMousemove);
    }
  }

  function dragEnds() {
    if (draggedItem) {
      draggedItem.style.background = "";
      draggedItem.classList.remove("dragging");
      isDragging = false;
      let nextItem;
      let itemSibilings = mainDiv.querySelectorAll("#tab-panels-menupopup-view > menuitem:not(.dragging)");

      itemSibilings.forEach((sibiling) => {
        sibiling.style.marginTop = "";
        if (sibiling.previousSibling === draggedItem) {
          nextItem = sibiling;
        }
      });
      //Move whole panel tabs in tab strip
      let panelId = draggedItem.getAttribute("panel-id");
      let dragEndPos = Array.prototype.indexOf.call(draggedItem.parentNode.children, draggedItem) - 1;
      draggedItem = null;

      if (dragStartPos != dragEndPos) {
        if (nextItem == null) {
          //last position
          window.nativeTreeTabs.movePanel(panelId, null);
        } else {
          let beforePanelId = nextItem.getAttribute("panel-id");
          window.nativeTreeTabs.movePanel(panelId, beforePanelId);
        }
      }
    }
  }

  handleMouseUp = function(aEvent) {
    if (draggedItem) {
      if (helddown > 10) {
        aEvent.preventDefault();
      }
      dragEnds();
    }
    document.removeEventListener("mouseup", handleMouseUp);
  }

  tabPanelGroup.addEventListener("auxclick", (aEvent) => {
    let button = aEvent.button;
    if (button == 1) {
      nativeTreeTabs.tabPanelOpen();
      return;
    }
    panelNameRightClick(aEvent);
  });

  tabPanelGroup.addEventListener("click", function(aEvent) {
    if (aEvent.target !== tabPanelButton && !tabPanelButton.contains(aEvent.target)) {
      let foundInput = tabPanelGroup.querySelectorAll(":scope > input");
      if (foundInput.length > 0) {
        return;
      }
    }
    window.nativeTreeTabs.tabPanels.forEach(updateCountInMenu, this);
    let items = menupopup.querySelectorAll("[panel-id]");
    if (items.length === 1) {
      items[0].style.display = "none"
    } else {
      items.forEach((item) => {
        item.style.display = "";
      });
    }
    menupopup.openPopup(tabPanelButton, "after_start", 6, 0, false, false);
  });

  makePopupStayOpen(menupopup, dragEnds);

  let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
    Ci.nsIStyleSheetService
  );
  let customCSS = `
  sidebar-main {
   flex: 1;
   max-height: calc( 100% - 30px ); 
}
box:has(>sidebar-main) {
    flex-flow: column!important;
}
#tab-panels-group {
    max-width:80%;
    min-width: 0;
    overflow: clip;
    display: flex;
    align-items: center;
}
#tab-panels-button img {
    -moz-context-properties: fill, fill-opacity, stroke;
    content: url("chrome://browser/skin/tabs.svg");
    fill: var(--toolbarbutton-icon-fill)!important;
    background-color: transparent!important;
}
box:has(>sidebar-main):not([sidebar-launcher-expanded])  {
  #tab-panels-group .dropdown-arrow,
  #tab-panels-name{
    display: none;
  }
}
:root:not([customizing])[uidensity="compact"] box:has(>sidebar-main):not([sidebar-launcher-expanded]) #tab-panels-button {
    padding-inline-start: 7px;
}
:root:not([customizing]) box:has(>sidebar-main):not([sidebar-launcher-expanded]) #tab-panels-button {
    padding-inline-start: 9px;
}
:root:not([customizing])[uidensity="touch"] box:has(>sidebar-main):not([sidebar-launcher-expanded]) #tab-panels-button {
    padding-inline-start: 12px;
}
#tab-panels-group .button-background:hover {
    background-color: var(--button-background-color);
}
#tab-panels-group .button-background {
    box-sizing: border-box;
    min-height: var(--button-min-height);
    border: none!important;
    color: var(--button-text-color);
    padding: var(--button-padding);
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    width: var(--button-size-icon);
    height: var(--button-size-icon);
    padding: var(--button-padding-icon);
}
#tab-panels-name {
    flex-shrink: 1;
    font-size: 13px!important;
    margin-left: 0px;
    margin-top: 8px;
    max-width:80%;
    max-height: 20px;
    overflow: clip;
    text-overflow: "...";
    text-wrap: nowrap;
}
#tab-panels-group input:focus-visible {
    border: none!important;
    padding: 7px!important;
    margin-left: -4px!important;
    margin-top: 3px!important;
    width:fit-content;
    min-width:fit-content;
    max-width:80%;
}
#tab-panels-group input {
    border: none!important;
    margin-top: 0px!important;
}
#tab-panels-group .dropdown-arrow {
    -moz-context-properties: fill, fill-opacity, stroke;
    fill: var(--toolbarbutton-icon-fill)!important;
    width: 12px;
    height: fit-content;
    content: url("chrome://global/skin/icons/arrow-down-12.svg");
    padding-left: 4px;
    opacity: 0.86
}
#tab-panels-menupopup-view {
    display: flex;
    flex-flow: column;
    padding: 0px!important;
}
#tab-panels-menupopup-view:has(menuitem[checked]) {
    padding-top: 7px!important;

}
#tab-panels-menupopup menuitem {
    font-size: 14px;
    color: var(--toolbox-textcolor-inactive, var(--toolbox-text-color-inactive));
    padding-left: 15px;
    padding-right: 15px;
    padding-top: 10px;
    padding-bottom: 10px;
    border: 1px solid transparent;
    border-radius: 9px;
    transition: margin 0.25s;
    transition: background 0.25s;

    box-sizing: border-box;
}
#tab-panels-menupopup menuitem.dragging {
    transform: scale(1.1);
}
#tab-panels-menupopup menuitem[checked] {
    color: var(--toolbox-textcolor, var(--toolbox-text-color));
    opacity: 1;
    background: var(--button-background-color-active, var(--toolbarbutton-background-color-active)) padding-box;
}
#tab-panels-menupopup-view input {
    margin-top:5px!important;
    margin-left:4px;
    max-width:90%;
    align-self:center;
}
#tab-panels-menupopup .add-panel-button {
    justify-content: center;
    display: flex;
    flex-flow: row;
    border-top: 1px solid var(--panel-border-color);
    order: 100!important;
    align-items: center;
    margin-top: 5px;
    padding-bottom: 5px;
}
#tab-panels-menupopup-view:has(> :last-child:nth-child(2))
.add-panel-button,
#tab-panels-menupopup .add-panel-button:only-child
{
    border-top: none!important;
    padding-bottom: 10px;
    padding-top: 0
}
#tab-panels-menupopup .add-panel-button img {
    -moz-context-properties: fill, fill-opacity, stroke;
    fill: var(--toolbarbutton-icon-fill)!important;
    width: 18px;
    height: fit-content;
    content: url(chrome://global/skin/icons/plus.svg);
    padding-left: 5px;
}
#tab-panels-menupopup .add-panel-button menuitem {
    color: var(--toolbox-textcolor, var(--toolbox-text-color));
    font-size: 13px;
    padding-top: 7px;
    padding-left: 0px!important;
    margin-left:0;
}
#tab-context-create-new-panel{
  border-bottom: 1px solid var(--panel-separator-color);
  margin-bottom: 4px;
}
#tab-context-create-new-panel:only-child{
  border-bottom: none;
  margin-bottom: 0px;
}

  `;
  let styleURI = makeURI(
    `data:text/css;charset=UTF=8,${encodeURIComponent(customCSS)}`
  );

  if (!styleSvc.sheetRegistered(styleURI, styleSvc.AGENT_SHEET)) {
    styleSvc.loadAndRegisterSheet(styleURI, styleSvc.AGENT_SHEET);
  }
  return styleURI;
}

loadNTTstyle = function() {
  let rootTabTopMargin = "10";
  if (Services.prefs.getPrefType("treeTabs.rootTabTopMargin") != 32) {
    Services.prefs.setStringPref("treeTabs.rootTabTopMargin", rootTabTopMargin);
  } else {
    rootTabTopMargin = Services.prefs.getStringPref("treeTabs.rootTabTopMargin");
  }
  let branchTabTopMargin = "2";
  if (Services.prefs.getPrefType("treeTabs.branchTabTopMargin") != 32) {
    Services.prefs.setStringPref("treeTabs.branchTabTopMargin", branchTabTopMargin);
  } else {
    branchTabTopMargin = Services.prefs.getStringPref("treeTabs.branchTabTopMargin");
  }
  let tabHeight = "31";
  if (Services.prefs.getPrefType("treeTabs.tabHeight") != 32) {
    Services.prefs.setStringPref("treeTabs.tabHeight", tabHeight);
  } else {
    tabHeight = Services.prefs.getStringPref("treeTabs.tabHeight");
  }
  let labelFontSize = "13.4";
  if (Services.prefs.getPrefType("treeTabs.labelFontSize") != 32) {
    Services.prefs.setStringPref("treeTabs.labelFontSize", labelFontSize);
  } else {
    labelFontSize = Services.prefs.getStringPref("treeTabs.labelFontSize");
  }
  let tabBorderRadius = parseInt(window.getComputedStyle(document.querySelector(["tab"])).getPropertyValue('--tab-border-radius'));
  if (Services.prefs.getPrefType("treeTabs.tabBorderRadius") != 32) {
    Services.prefs.setStringPref("treeTabs.tabBorderRadius", tabBorderRadius);
  } else {
    tabBorderRadius = Services.prefs.getStringPref("treeTabs.tabBorderRadius");
  }
  let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
    Ci.nsIStyleSheetService
  );
  let customCSS = `
:root {
    --root-tab-top-margin: ` + rootTabTopMargin + `px;
    --branch-tab-top-margin:  ` + branchTabTopMargin + `px;
    --tab-height: ` + tabHeight + `px;
    --label-font-size: ` + labelFontSize + `px;
    --tab-close-button-padding-custom: 4px;
    --tab-border-radius-forced: ` + tabBorderRadius + `px;
}
#vertical-tabs tab[tree-depth="0"] { --tab-indent: 0; }
#vertical-tabs tab[tree-depth="1"] { --tab-indent: 11; }
#vertical-tabs tab[tree-depth="2"] { --tab-indent: 21; }
#vertical-tabs tab[tree-depth="3"] { --tab-indent: 31; }
#vertical-tabs tab[tree-depth="4"] { --tab-indent: 41; }
#vertical-tabs tab[tree-depth="5"] { --tab-indent: 51; }
#vertical-tabs tab[tree-depth="6"] { --tab-indent: 61; }
#vertical-tabs tab[tree-depth="7"] { --tab-indent: 71; }
#vertical-tabs tab[tree-depth="8"] { --tab-indent: 81; }
#vertical-tabs tab[tree-depth="9"] { --tab-indent: 91; }

#tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab {
    max-width: calc(100% - var(--tab-indent))!important;
    padding-inline-start: calc( ( ( 3.7 * var(--tab-indent) * var(--tab-indent) * var(--tab-indent) + ( 30 * var(--tab-indent) * var(--tab-indent))) / ( 11 * var(--tab-indent) * var(--tab-indent) + ( 10 * var(--tab-indent)) + 100)) * 1%) !important;
}
@container (min-width: 260px) {
    #tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab {
        padding-inline-start: calc(var(--tab-indent) * 1px)!important;
    }
}
#vertical-tabs tab:not(collapsed, [pinned]) {
    margin-bottom: 0px!important;
    padding-block-start: 0px!important;
    padding-block-end: 0px!important;
}
#vertical-tabs tab:not(collapsed, [pinned], [hidden-child], [tabPanel-hidden]) {
    padding-top: var(--branch-tab-top-margin)!important;
}
#tabbrowser-arrowscrollbox[orient="vertical"]>tab:not(collapsed, [pinned], [tabPanel-hidden])[tree-depth="0"], #tabbrowser-arrowscrollbox[orient="vertical"]>tab-split-view-wrapper {
    padding-top: var(--root-tab-top-margin) !important;
    margin-bottom: 0px!important;
}
/*TOP tab margin from top*/
#tabbrowser-arrowscrollbox[orient="vertical"] {
    tab:not(collapsed, [pinned], [tabPanel-hidden])[tree-depth="0"] {
        padding-top: 6px!important;
    }
    tab:not(collapsed, [pinned], [tabPanel-hidden])[tree-depth="0"]~tab:not(collapsed, [pinned], [tabPanel-hidden])[tree-depth="0"] {
        padding-top: var(--root-tab-top-margin) !important;
    }
}

/*Tab style */
#vertical-tabs tab {
    --tab-min-height: var(--tab-height) !important;
}
#vertical-tabs tab .tab-label {
    font-size: var(--label-font-size)!important;
}
/*No container line*/
#vertical-tabs .tab-context-line {
    display: none!important;
}
/*Close button style */
#tabbrowser-arrowscrollbox[orient="vertical"]>tab .tab-close-button {
    padding: var(--tab-close-button-padding-custom)!important;
}
/*default favicon loading*/
#vertical-tabs tab[pendingicon="true"] .tab-icon-image {
    opacity: 0!important;
}
/* New tab button */
#vertical-tabs-newtab-button .toolbarbutton-text, #vertical-tabs #tabs-newtab-button .toolbarbutton-text {
    display: none!important;
}
/* Audio playing icon enlarge */
.tab-audio-button {
    transform: scale(1.132);
    margin-right: 3px;
}
/*Make the audio playing tab blink */
@keyframes blink-animation {
    0% {
        filter: brightness(1) opacity(1);
    }
    50% {
        filter: brightness(1) opacity(1);
    }
    70% {
        filter: brightness(1.5) opacity(1);
    }
    100% {
        filter: brightness(1) opacity(1);
    }
}
tab[soundplaying] .tab-background {
    animation: blink-animation 1s infinite;
}

/*Twisty */
#tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root]:not([hidden-child],[tabPanel-hidden]) .tab-icon-stack::before {
    content: url("chrome://global/skin/icons/arrow-right-12.svg")!important;
    transform: scale(1.4)!important;
    -moz-context-properties: fill, stroke!important;
    min-width: fit-content!important;
    min-height: 20px!important;
    display: block!important;
    margin-top: 3px!important;
    margin-left: -20px!important;
    fill: black!important;
    background: transparent!important;
    position: absolute!important;
}
@media (prefers-color-scheme: dark) {
  #tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root] .tab-icon-stack::before {
    filter:invert(1);
  }
}
.tab-icon-stack {
    #tabbrowser-tabs[orient="vertical"][expanded] tab[twisted-root] &:not([pinned]) {
        margin-left: 25px!important;
    }
}
.tab-icon-image {
    #tabbrowser-tabs[orient="vertical"][expanded] tab[twisted-root] &:not([pinned]) {
        margin-left: -2px!important;
    }
}
.tab-icon-stack {
    #tabbrowser-tabs[orient="vertical"]:not([expanded]) tab[twisted-root] &:not([pinned]) {
        margin-left: 22px!important;
        margin-top: -18px!important;
    }
}
.tab-icon-image {
    #tabbrowser-tabs[orient="vertical"]:not([expanded]) tab[twisted-root] &:not([pinned]) {
        display: none!important;
    }
}
#tabbrowser-arrowscrollbox[orient="vertical"] tab[hidden-child] *, #tabbrowser-arrowscrollbox[orient="vertical"] tab[hidden-child] {
    max-height: 0px!important;
    min-height: 0px!important;
}
/* ABSOLUTE CINEMA */
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='0']:not([twisted-root]):has(+tab:not([tree-depth='0'])) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='1']:not([twisted-root]):has(+tab[tree-depth='2']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='2']:not([twisted-root]):has(+tab[tree-depth='3']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='3']:not([twisted-root]):has(+tab[tree-depth='4']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='4']:not([twisted-root]):has(+tab[tree-depth='5']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='5']:not([twisted-root]):has(+tab[tree-depth='6']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='6']:not([twisted-root]):has(+tab[tree-depth='7']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='7']:not([twisted-root]):has(+tab[tree-depth='8']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='8']:not([twisted-root]):has(+tab[tree-depth='9']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[tree-depth='9']:not([twisted-root]):has(+tab[tree-depth='2']) .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
}
#tabbrowser-arrowscrollbox[orient="vertical"] tab[tabPanel-hidden] *::before,
#tabbrowser-arrowscrollbox[orient="vertical"] tab[tabPanel-hidden],
#tabbrowser-arrowscrollbox[orient="vertical"] tab[tabPanel-hidden] * {
    max-height: 0px!important;
    min-height: 0px!important;
    margin-block: 0!important;
    margin-top: 0!important;
    margin-block-start: 0!important;
    border:none!important;
}
#pinned-tabs-container:has(>tab[tabPanel-hidden="true"]) {
    display: none;
}
#pinned-tabs-container:has(tab:not([tabPanel-hidden="true"])) {
    display: flex!important;
}
#vertical-pinned-tabs-splitter {
    #pinned-tabs-container:has(>tab[tabPanel-hidden="true"])+& {
        display: none;
    }
}
#vertical-pinned-tabs-splitter {
    #pinned-tabs-container:has(tab: not([tabPanel-hidden="true"])) + & {
        display:block!important;
    }
}
#pinned-tabs-container[orient="vertical"]{
  min-height:0!important;
}

/*Tab Groups*/

#vertical-tabs tab-group:has(tab[tabPanel-hidden="true"]){
  display: none!important;
}
#vertical-tabs .tab-group-label-container{
  margin-left: 4px!important;
}
#vertical-tabs tab-group{
  padding-left: -10px!important;
  margin-block: 0p!important;
}
#vertical-tabs tab-group[collapsed] .tab-group-label-container{
   margin-left: 9px!important;
}
#vertical-tabs tab{
  border-left: 2px solid var(--tab-group-line-color)!important;
}
#vertical-tabs .tab-group-line{
  display: none!important;
} 


/*Styling*/

:root {
    --tree-tab-default-color: rgb(130, 120, 140);
    --tab-icon-start: 3px;
}
#vertical-tabs tab .tab-background {
    border-radius: var(--tab-border-radius-forced)!important;
}
@media (prefers-color-scheme: dark) {
  #vertical-tabs tab:not([selected]) .tab-background {
      background-color: color-mix(in srgb, var( --tree-domain-color, color-mix( in srgb, var(--identity-icon-color, currentColor) 40%, black)) 18%, rgba(100, 100, 100, 0.005))!important;
      backdrop-filter: blur(5px);
      border: 1px solid rgba(55, 55, 55, 0.3);
      border-color: color-mix( in srgb, color-mix( in srgb, var( --tree-domain-border-color, var(--tree-domain-color, var(--identity-icon-color, rgba(140, 120, 140)))) 15%, rgba(200, 200, 200, 0)) 90%, color-mix(in srgb, silver 15%, transparent));
      opacity: 1;
      filter: saturate(1) brightness(1);
  }
  #vertical-tabs tab[selected]:not([multiselected]) .tab-background {
      backdrop-filter: blur(5px);
      outline: none!important;
      border: 2px solid transparent!important;
      background: linear-gradient( color-mix( in srgb, var( --tree-domain-color, color-mix( in srgb, var(--identity-icon-color, rgba(130, 120, 140)) 40%, rgb(20, 20, 20))) 33%, rgba(2, 2, 2, 0.95))) padding-box, linear-gradient(96deg, color-mix( in srgb, color-mix( in srgb, var( --tree-domain-border-color, var(--identity-icon-color, rgba(255, 180, 240))) 70%, rgba(240, 240, 240, 0.3)) 40%, color-mix(in srgb, silver 70%, transparent)) 50%, color-mix( in srgb, color-mix( in srgb, var( --tree-domain-border-color, var(--identity-icon-color, rgba(255, 180, 240))) 70%, rgba(240, 240, 240, 1)) 60%, color-mix(in srgb, gold 60%, transparent))) border-box;
      opacity: 0.8;
  }
  .tab-label[selected] {
      color: white!important;
  }
  .tab-label:not([selected]) {
      color: color-mix( in srgb, var(--identity-icon-color, rgba(140, 120, 140)) 15%, rgb(220, 220, 220, 0.95));
  }
  #tabbrowser-arrowscrollbox[orient="vertical"]>tab-split-view-wrapper:has([selected]) {
      outline: 0px solid;
      outline-color: rgba(120, 50, 50, 1);
      background: color-mix( in srgb, rgba(140, 140, 180) 0%, transparent);
            background: linear-gradient( color-mix( in srgb, var( --tree-domain-color, color-mix( in srgb, var(--identity-icon-color, rgba(130, 120, 140)) 40%, rgb(20, 20, 20))) 33%, rgba(2, 2, 2, 0.95))) padding-box, linear-gradient(96deg, color-mix( in srgb, color-mix( in srgb, var( --tree-domain-border-color, var(--identity-icon-color, rgba(255, 180, 240))) 70%, rgba(240, 240, 240, 0.3)) 40%, color-mix(in srgb, silver 70%, transparent)) 50%, color-mix( in srgb, color-mix( in srgb, var( --tree-domain-border-color, var(--identity-icon-color, rgba(255, 180, 240))) 70%, rgba(240, 240, 240, 1)) 60%, color-mix(in srgb, gold 60%, transparent))) border-box;

  }
  #tabbrowser-arrowscrollbox[orient="vertical"]>tab-split-view-wrapper:has([selected]) .tab-background:not([selected]) {
      background: transparent!important;
      border: none!important;
  }
}
@media (prefers-color-scheme: light) {
  #vertical-tabs tab:not([selected]) .tab-background {
      background-color: color-mix(in srgb, var( --tree-domain-color, color-mix( in srgb, var(--identity-icon-color, currentColor) 40%, white)) 8%, rgba(250, 250, 250, 0.005))!important;
      backdrop-filter: blur(5px);
      border: 1px solid rgba(55, 55, 55, 0.3);
      border-color: color-mix( in srgb, color-mix( in srgb, var( --tree-domain-border-color, var(--tree-domain-color, var(--identity-icon-color, rgba(20, 20, 20)))) 15%, rgba(200, 200, 200, 0)) 20%, color-mix(in srgb, silver 45%, transparent));
      opacity: 1;
      filter: saturate(1) brightness(1);
  }
  #vertical-tabs tab[selected]:not([multiselected]) .tab-background {
      backdrop-filter: blur(5px);
      outline: none!important;
      border: 2px solid transparent!important;
      opacity: 0.8;
  }

  #tabbrowser-arrowscrollbox[orient="vertical"]>tab-split-view-wrapper:has([selected]) {
      outline: 1px solid;
      outline-color: rgba(120, 50, 50, 0.7);
      background: color-mix( in srgb, rgba(255, 255, 255) 50%, transparent);
  }
}
.tab-content:not([selected]) {
    filter: brightness(0.98) contrast(0.9);
    opacity: 0.98;
}
.tab-icon-image {
    #tabbrowser-tabs[orient="vertical"][expanded] tab:not([twisted-root]) &:not([pinned]) {
        margin-inline-start: var(--tab-icon-start);
    }
}
/* Add custom tab colors based on domain, uncomment and add your sites and color */

/*
#vertical-tabs tab[domain^="example.com"] { --tree-domain-color: rgb(60,55,60);--tree-domain-border-color: rgb(150,0,0); }
#vertical-tabs tab[domain^="youtube.com"] { --tree-domain-color: rgb(240,0,0);  --tree-domain-border-color: rgb(250,10,30);}
#vertical-tabs tab[domain^="reddit.com"] { --tree-domain-color: rgb(80,120,150); }
#vertical-tabs tab[domain$="github.com"] { --tree-domain-color: rgb(0,0,20); --tree-domain-border-color: darkblue;}
#vertical-tabs tab[domain$="ycombinator.com"] { --tree-domain-color: rgb(120,120,70); --tree-domain-border-color: yellow;}
#vertical-tabs tab[domain^="about"] { --tree-domain-color: rgb(120,10,120); }
#vertical-tabs tab[domain^="chrome"] { --tree-domain-color: rgb(120,170,170); }
#vertical-tabs tab[domain^="moz-extension"] { --tree-domain-color: rgb(60,55,60);--tree-domain-border-color: rgb(150,0,0); }

 */

`;
  let styleURI = makeURI(
    `data:text/css;charset=UTF=8,${encodeURIComponent(customCSS)}`
  );

  if (!styleSvc.sheetRegistered(styleURI, styleSvc.AUTHOR_SHEET)) {
    styleSvc.loadAndRegisterSheet(styleURI, styleSvc.AUTHOR_SHEET);
  }
  return styleURI;
}
