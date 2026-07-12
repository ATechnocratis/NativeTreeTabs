// ==UserScript==
// @name           Native Tree Tabs
// @version        0.2.3.2
// ==/UserScript==
const isTab = element => gBrowser.isTab(element);
const moveChildren = true;
const MAX_STACK_SIZE = 30;

window.nativeTreeTabs = {
  _tabEvents: ["SSTabRestoring", "TabClose", "TabOpen", "TabMove", "TabSelect", "TabUnpinned"],
  lastId: 0,
  originalRemoveTab: null,
  originalPinTab: null,
  originalAddTabSplitView: null,
  originalAddToMultiSelectedTabs: null,
  originalAdvanceSelectedTab: null,
  original_findTabToBlurTo: null,
  originalCloseTabOrWindow: null,
  original_getTabsToTheEndFrom: null,
  original_getTabsToTheStartFrom: null,
  originalRemoveAllTabsBut: null,
  moveNewTabsDirectlyUnderParent: true,
  customStyle: null,
  selectedtPanel: null,
  previousSelectedPanel: null,
  tabPanels: [],
  defaultPanelName: "Default Panel",
  lockCtrlTabInPanel: true,
  previousSelectedTab: new Array(),
  selectedTab: null,
  clickedActiveTab: null,
  switchSelectedOnClick: false,
  switchSelectedOnClickStayOnPanel: true,
  hopOverUnloadedTabs: false,
  hopOverCollapsedTabs: true,

  init: function() {

    this.initPreferences();
    this.addDefaultPanel();
    addNTTSidebarHeader();

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
    this.defaultFunctionWrap();

    //Used to find if the clicked tab is actually the selected tab or the too be selected 
    gBrowser.tabContainer.addEventListener("mousedown", this, true);

    this.addTabGroupCreateListeners();

    this.customStyle = loadNTTstyle();
    Services.prefs.addObserver("treeTabs.rootTabTopMargin", this);
    Services.prefs.addObserver("treeTabs.branchTabTopMargin", this);
    Services.prefs.addObserver("treeTabs.tabHeight", this);
    Services.prefs.addObserver("treeTabs.labelFontSize", this);
    Services.prefs.addObserver("treeTabs.tabBorderRadius", this);

    //add keyboard shortcut for tab panel cycle
    window.addEventListener("keydown", function handler(e) {
      if (e.ctrlKey && (e.key === "," || e.key === "<") && !e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const shift = e.shiftKey;
        nativeTreeTabs.cycleTabPanels(shift ? -1 : 1);
      }
    }, true);
    //add keyboard shortcut for tab panel creation
    window.addEventListener("keydown", function handler(e) {
      if (e.ctrlKey && e.key === "," && e.altKey & !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.nativeTreeTabs.tabPanelOpen()
      }
    }, true);
    //add keyboard shortcut for selected tab moving/indention change
    window.addEventListener("keydown", function handler(e) {
        if (!e.ctrlKey || !e.altKey) {
          return;
        }
        let arguments;
        let doAction;
        if (!e.shiftKey) {
          switch (e.key) {
            case "ArrowRight":
              arguments = "in";
              doAction = nativeTreeTabs.indentTab;
              break;
            case "ArrowLeft":
              arguments = "out";
              doAction = nativeTreeTabs.indentTab;
              break;
            default:
              break;
          }
          switch (e.key) {
            case "ArrowUp":
              arguments = "up";
              doAction = nativeTreeTabs.moveTab;
              break;
            case "ArrowDown":
              arguments = "down";
              doAction = nativeTreeTabs.moveTab;
              break;
            default:
              break;
          }

        }
        if (doAction != null) {
          e.preventDefault();
          e.stopImmediatePropagation();
          doAction(arguments);
        }
      },
      true);

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
    gBrowser._findTabToBlurTo = this.original_findTabToBlurTo;
    BrowserCommands.closeTabOrWindow = this.originalCloseTabOrWindow;
    gBrowser.original_getTabsToTheEndFrom = this.original_getTabsToTheEndFrom;
    gBrowser.original_getTabsToTheStartFrom = this.original_getTabsToTheStartFrom;
    gBrowser.originalRemoveAllTabsBut = this.originalRemoveAllTabsBut;

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
      case "TabUnpinned":
        {
          this.tabUnpinned(aEvent.target, aEvent);
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
  updateChildrenFromIndex: function(aTab, prevPosition, newPosition, tabOriginalDepth, groupState = false, forceMultiselected = false) {
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
    let multiSelected = aTab.multiselected && !forceMultiselected;

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
    let aTabTreeId = aTab.getAttribute("tree-id");
    let seenIds = new Map();

    while (nextTab) {
      //skip multiselected
      while (nextTab && nextTab.multiselected && !forceMultiselected && (!multiSelectIllegalMove && nextTab != aTab)) {
        nextTabTreeDepth = getTreeDepth(nextTab);
        if (nextTabTreeDepth == null || nextTabTreeDepth <= tabOriginalDepth) {
          break;
        }
        nextTab = nextTab.nextSibling;
      }

      if (isIngroup) {
        while (nextTab && nextTab.hasAttribute("hidden-child") && nextTab.getAttribute("hidden-child-rootID") != aTabTreeId) {
          let twistedRootId = nextTab.getAttribute("hidden-child-rootID");
          let nextTrueParent = seenIds.get(twistedRootId);
          if (nextTrueParent == null) {
            nextTrueParent = gBrowser.tabs.find(x => x.getAttribute("tree-id") === twistedRootId);
            seenIds.set(twistedRootId, nextTrueParent);
          }
          nextTabTreeDepth = getTreeDepth(nextTab);
          if (nextTabTreeDepth == null || nextTabTreeDepth <= tabOriginalDepth || !nextTrueParent.multiselected) {
            break;
          }
          nextTab = nextTab.nextSibling;
        }
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
      gBrowser.moveTabsAfter(tabsToMove, aTab, {
        metricsContext: gBrowser.TabMetrics.userTriggeredContext(
          gBrowser.TabMetrics.METRIC_SOURCE.DRAG_AND_DROP
        )
      });
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
  updateChildrenLite: function(aTab, tabOriginalDepth, andMultiselected = false) {
    let nextTab = getNextTab(aTab);
    let depthFix = parseInt(tabOriginalDepth, 10) - getTreeDepth(aTab);

    while (nextTab) {
      if (andMultiselected == false) {
        while (nextTab && nextTab.multiselected) {
          nextTab = nextTab.nextSibling;
        }
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
    let rect = aTab.getBoundingClientRect().top;

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
    if (previousTab) {
      let rectPrv = previousTab.getBoundingClientRect().top;
      //Stop case where wrong previousTab is set
      // previous is actually under
      // Internal (drag-and-drop) bug?
      if (rectPrv > rect) {
        previousTab = null;
      }
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

    //titlebar enabled case
    let mainWindow = document.getElementById("main-window");
    let mainWindowExtra = (mainWindow != null) ? mainWindow.screenY : 0;
    if (mainWindowExtra == 0) {
      mainWindowExtra = window.screenY;
    }

    let offsetY = aEvent.offsetY - mainWindowExtra - childrenCount;

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

    let tabHeight = 31;

    if (Services.prefs.getPrefType("treeTabs.tabHeight") != 32) {} else {
      tabHeight = Services.prefs.getStringPref("treeTabs.tabHeight");
    }

    let calcDistance = tabHeight / 1.4 - 8;

    if (calcDistance < -4) {
      calcDistance = -4;
    }

    if (previousTabDepth != null && offsetY < calcDistance) {
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
      if (previousTabDepth != null && offsetY < (calcDistance + 4) && (nextTabDepth == null || nextTabDepth == 0)) {
        newDepth = previousTabDepth;
        shouldUpdateChildren = true;
        if (newDepth != 0) copyOpener(aTab, previousTab);
      }
      //Case 2: Dropped under a tab with space between
      // Don't stick, became a zero depth root
      else if ((nextTabDepth == null || nextTabDepth == 0) && offsetY > (calcDistance + 7)) {
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
  newGroupCreation: function(aTab, prevPosition, newPosition) {
    window.gBrowser.selectedTabs.forEach(function(sTab) {
      sTab.setAttribute("groupCreationSkip", "true");
      let sTabtreeDepth = getTreeDepth(sTab);

      let nextChild = getNextTab(sTab);
      if (sTab === aTab) {
        let possibleChildIndex = (prevPosition >= newPosition) ?
          prevPosition + 1 : prevPosition;
        nextChild = gBrowser.tabs[possibleChildIndex];
      }
      if (nextChild === aTab) {
        nextChild = getNextTab(nextChild);
      }
      while (nextChild) {
        childDepth = getTreeDepth(nextChild);
        if (childDepth == null || childDepth <= sTabtreeDepth) {
          break;
        }
        if (nextChild.multiselected) {
          nextChild.setAttribute("skipGroupDepthUpdate", "true");
        }
        nextChild = getNextTab(nextChild);
        if (nextChild === aTab) {
          nextChild = getNextTab(nextChild);
        }
      }
    }, this);
    aTab.removeAttribute("groupCreationSkip", "true");
    aTab.removeAttribute("skipGroupDepthUpdate", "true");
  },

  checkForPanelOverStep: function(aTab, prevPosition, tabOriginalDepth, group) {
    let aTabPanelId = aTab.getAttribute("panel-id");
    let actualNext = getNextTab(aTab);
    if (isTab(actualNext) && actualNext.hasAttribute("tabPanel-hidden")) {
      let nextInPanel = window.gBrowser.tabContainer.findNextTab(aTab, {
        direction: 1,
        wrap: false,
        filter: tab => visibleOrInGroup(tab) && tab.getAttribute("panel-id") === aTabPanelId && !tab.pinned,
      });
      if (nextInPanel) {
        if (group) {
          let tabToMoves = aTab.group;
          tabToMoves.tabs.forEach(function(mTab) {
            mTab.setAttribute("skipMoveForced", "true");
          }, this);
          nativeTreeTabs.moveTabBefore(tabToMoves, nextInPanel);
          tabToMoves.tabs.forEach(function(mTab) {
            mTab.removeAttribute("skipMoveForced");
          }, this);
        } else {
          aTab.setAttribute("skipMoveForced", "true");
          nativeTreeTabs.moveTabBefore(aTab, nextInPanel);
          aTab.removeAttribute("skipMoveForced");
          this.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, tabOriginalDepth);
        }
        return true;
      }
    }
    let actualPrevious = getPreviousTab(aTab);
    if (isTab(actualPrevious) && actualPrevious.hasAttribute("tabPanel-hidden")) {
      let previousnPanel = window.gBrowser.tabContainer.findNextTab(aTab, {
        direction: -1,
        wrap: false,
        filter: tab => visibleOrInGroup(tab) && tab.getAttribute("panel-id") === aTabPanelId && !tab.pinned,
      });
      if (previousnPanel) {
        if (group) {
          let tabToMoves = aTab.group;
          tabToMoves.tabs.forEach(function(mTab) {
            mTab.setAttribute("skipMoveForced", "true");
          }, this);
          nativeTreeTabs.moveTabAfter(tabToMoves, previousnPanel);
          tabToMoves.tabs.forEach(function(mTab) {
            mTab.removeAttribute("skipMoveForced");
          }, this);
        } else {
          aTab.setAttribute("skipMoveForced", "true");
          nativeTreeTabs.moveTabAfter(aTab, previousnPanel);
          aTab.removeAttribute("skipMoveForced");
          this.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, tabOriginalDepth);
        }
        return true;
      }
    }
    return false;
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
      //Check if group moved over hidden tabs
      if (this.checkForPanelOverStep(aTab, 0, 0, true)) {
        return;
      }
      let previousTab = aTab.group.previousSibling;
      if (isTab(previousTab) && !previousTab.hasAttribute("tabPanel-hidden") && previousTab.group != aTab.group) {
        let nextTab = aTab.group.nextSibling;

        //Check if moved inside a tree ( Split tree )
        //Create new zero level depth roots from subtrees
        while (isTab(nextTab) && !nextTab.hasAttribute("tabPanel-hidden")) {
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
    let prevPosition = aEvent.detail.previousTabState.tabIndex;
    let newPosition = aEvent.detail.currentTabState.tabIndex;

    //Tab Group label drag, skip updating
    // tabs inside the group
    if (aTab.hasAttribute("tabGroupDrag")) {
      aTab.removeAttribute("tabGroupDrag");
      if (prevPosition > newPosition) {
        if (aTab.group.tabs.indexOf(aTab) === aTab.group.tabs.length - 1) {
          this.checkTreeSplit(aTab, aEvent);
        }
      } else {
        if (aTab.group.tabs.indexOf(aTab) === 0) {
          this.checkTreeSplit(aTab, aEvent);
        }
      }
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
    let telemetrySource = (aEvent.detail.metricsContext) ? aEvent.detail.metricsContext.telemetrySource : aEvent.detail.telemetrySource;

    //Whole group ungroup
    if (aEvent.detail.previousTabState.tabGroupId && !aEvent.detail.currentTabState.tabGroupId && prevPosition === newPosition &&
      telemetrySource != "drag") {
      // this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, aEvent.detail.previousTabState.tabGroupId);
      return;
    }

    //Multiselected group creation keep tree structure
    if (!aEvent.detail.previousTabState.tabGroupId && aEvent.detail.currentTabState.tabGroupId &&
      telemetrySource != "drag" && aTab.multiselected) {
      if (!aTab.hasAttribute("groupCreationSkip")) {
        //First tab seen, prepare the others
        this.newGroupCreation(aTab, prevPosition, newPosition);
        //Remove so it can update child depth in updateChildrenFromIndex
        gBrowser.removeFromMultiSelectedTabs(aTab);
        this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, true);
        return;
      } else {
        aTab.removeAttribute("groupCreationSkip");
        if (aTab.hasAttribute("skipGroupDepthUpdate")) {
          //tab ancestor will be in the new group
          aTab.removeAttribute("skipGroupDepthUpdate")
          this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, true);
          return;
        } else {
          setTreeDepth(aTab, 0);
          this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, true);
          return;
        }
      }
    }

    let inGroup = (aTab.group && aEvent.detail.previousTabState.tabGroupId === aEvent.detail.currentTabState.tabGroupId) ? true : false;
    let previousTab = aTab.previousSibling;
    let nextTab = aTab.nextSibling;
    let aTabTreeId = aTab.getAttribute("tree-id");


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
        this.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, tabOriginalDepth);
        return;
      }
    }

    //illegal 3 (move on other tab panel)
    if (this.checkForPanelOverStep(aTab, prevPosition, tabOriginalDepth, false)) {
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
        nativeTreeTabs.moveTabBefore(aTab.splitview, getClosestZeroDepthTab(trueNext, direction));
      }
      return;
    }

    //Used for drop under last position in tab strip
    // dragend will overwrite this if (case 0,1,2 happens)
    if (newPosition == gBrowser.tabs.length - 1 || (isTab(nextTab) && nextTab.hasAttribute("tabPanel-hidden"))) {
      setTreeDepth(aTab, '0');
      this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth);
      return;
    }

    //Ignore hidden tabs and tabs selected to move 
    while (previousTab && (previousTab.hasAttribute("hidden-child") || previousTab.multiselected)) {
      previousTab = getPreviousTab(previousTab);
    }
    while (nextTab && (nextTab.hasAttribute("hidden-child") || nextTab.multiselected)) {
      nextTab = nextTab.nextSibling;
    }
    if (previousTab && previousTab.hasAttribute("tabPanel-hidden")) {
      previousTab = null;
    }
    if (nextTab && nextTab.hasAttribute("tabPanel-hidden")) {
      nextTab = null;
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
    this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth);

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

    let aTab = aEvent.target.closest(".tabbrowser-tab");

    if (SidebarController._sidebarMain.__expanded) {
      if (aEvent.target.closest(".tab-icon-stack") && !aTab.pinned) {
        return;
      }
    }
    let source = (nativeTreeTabs.switchSelectedOnClickStayOnPanel) ? nativeTreeTabs.selectedtPanel.previousSelectedTab : nativeTreeTabs.previousSelectedTab;

    let pSTab = source.pop();
    while (source.length > 0 && (pSTab == null || pSTab === aTab || !window.gBrowser.tabs.includes(pSTab))) {
      pSTab = source.pop();
    }

    if (!aTab || aTab !== nativeTreeTabs.clickedActiveTab || !aTab.selected ||
      !pSTab || pSTab === aTab || pSTab.closing) {

      nativeTreeTabs.clickedActiveTab = null;
      return;
    }

    gBrowser.selectedTab = pSTab;
    nativeTreeTabs.clickedActiveTab = null;
  },

  tabUnpinned: function(aTab, aEvent) {
    //Tab will be move to top
    // panel position might mismatch
    let nextTab = getNextTab(aTab);
    let aTabPanelId = aTab.getAttribute("panel-id");
    if (isTab(nextTab) && !aTab.pinned && nextTab.getAttribute("panel-id") != aTabPanelId) {
      let nextInPanel = window.gBrowser.tabContainer.findNextTab(aTab, {
        direction: 1,
        wrap: false,
        filter: tab => visibleOrInGroup(tab) && tab.getAttribute("panel-id") === aTabPanelId && !tab.pinned,
      });
      if (nextInPanel) {
        aTab.setAttribute("skipMoveForced", "true");
        nativeTreeTabs.moveTabBefore(aTab, nextInPanel);
        aTab.removeAttribute("skipMoveForced");
        return;
      }
    }
  },

  tabSelected: function(aTab) {

    //Select previous selected on click current selected click
    if (aTab !== this.selectedTab) {
      if (this.previousSelectedTab.length == 0 || this.previousSelectedTab[this.previousSelectedTab.length - 1] != this.selectedTab) {
        this.previousSelectedTab.push(this.selectedTab);
        if (this.previousSelectedTab.length > MAX_STACK_SIZE) {
          this.previousSelectedTab = this.previousSelectedTab.slice(1);
        }
      }
      if (this.selectedTab != null) {
        this.selectedTab.removeEventListener("click", this.previousSwitch);
      }
      this.selectedTab = aTab;
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
      if (panel && aTab != panel.selectedTab) {
        if (panel.previousSelectedTab.length == 0 || panel.previousSelectedTab[panel.previousSelectedTab.length - 1] != panel.selectedTab) {
          panel.previousSelectedTab.push(panel.selectedTab);
          if (panel.previousSelectedTab.length > MAX_STACK_SIZE) {
            panel.previousSelectedTab = panel.previousSelectedTab.slice(1);
          }
        }
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
        this.tabPanelShow(panel, changeSelectedTab = false);
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

    if (aTab.hasAttribute("tree-id")) {
      //already initialized
      return;
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

    setDomainAttr(aTab);

    let previousTab = getPreviousTab(aTab);
    let restorePaneldId = SessionStore.getCustomTabValue(aTab, "panel-id");
    let foundPanel = false;
    //Don't restore panel for out of window dragging
    let dragged = SessionStore.getCustomTabValue(aTab, "draggedFromWindow");

    if (dragged) {
      let thisWindowId = window.docShell.outerWindowID.toString();
      if (dragged != thisWindowId) {
        restorePaneldId = false;
      }
    }

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
        //Panel exists
        if (!findPanelInMenu(panel)) {
          addNewPanelInMenu(panel, checkIt = false);
        } else {
          //Panel is in menu
          if (previousTab && previousTab.hasAttribute("panel-id") && previousTab.hasAttribute("tabPanel-hidden")) {
            let previousPanelId = previousTab.getAttribute("panel-id");
            let previousPanelIndex = nativeTreeTabs.tabPanels.findIndex(x => x.id.toString() === previousPanelId);
            if (previousPanelIndex && nativeTreeTabs.tabPanels.indexOf(panel) < previousPanelIndex) {
              //Panel is in wrong position on the menu => move it
              // probably caused by pinned tab restore (happens first of all)
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
          } else if (!previousTab && nativeTreeTabs.tabPanels.indexOf(panel) != 0) {
            //Case of no previoustab in strip (excluding pinned tabs)
            // Panel should be first in the array but isn't => move it
            let menupopup = document.getElementById('tab-panels-menupopup-view');
            if (menupopup) {
              let panelItemInmenu = menupopup.querySelector('[panel-id="' + panel.id.toString() + '"]');
              let firstPanelInMenu = menupopup.parentNode.querySelector('#tab-panels-menupopup-view > menuitem');
              if (panelItemInmenu && firstPanelInMenu) {
                menupopup.insertBefore(panelItemInmenu, firstPanelInMenu);
              }
            }
          }
        }
      }
      setPanel(aTab, panel, window);
      foundPanel = true;

      if (aTab.selected) {
        this.tabPanelShow(panel, changeSelectedTab = false);
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
    let aTabPanelId = aTab.getAttribute("panel-id");
    //Tab position mismatch in panels
    if (isTab(previousTab) && !aTab.pinned && previousTab.getAttribute("panel-id") != aTabPanelId) {
      //first of a panel here or a wrong one
      previousInPanel = window.gBrowser.tabContainer.findNextTab(aTab, {
        direction: -1,
        wrap: false,
        filter: tab => tab.getAttribute("panel-id") === aTabPanelId && !tab.pinned,
      });
      if (previousInPanel) {
        if (aTab.group) {
          let tabToMoves = aTab.group;
          tabToMoves.tabs.forEach(function(mTab) {
            mTab.setAttribute("skipMoveForced", "true");
          }, this);
          nativeTreeTabs.moveTabAfter(tabToMoves, previousInPanel);
          tabToMoves.tabs.forEach(function(mTab) {
            mTab.removeAttribute("skipMoveForced");
          }, this);
        } else {
          aTab.setAttribute("skipMoveForced", "true");
          nativeTreeTabs.moveTabAfter(aTab, previousInPanel);
          aTab.removeAttribute("skipMoveForced");
        }
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
    if (isTab(getPreviousTab(aTab))) {
      let pTab = getPreviousTab(aTab);
      let nTab = getNextTab(aTab);
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
          nativeTreeTabs.moveTabBefore(aTab, newPosition);
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

    setTimeout(() => {
      if (!aTab.hasAttribute("tree-id")) {
        this.initTab(aTab);
      }
    }, 100);

    return treeDepth;
  },

  observe: function(subject, topic, name) {
    if (topic == "nsPref:changed") {
      if (name === "browser.tabs.insertRelatedAfterCurrent") {
        nativeTreeTabs.moveNewTabsDirectlyUnderParent = Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent");
        return;
      }
      if (name === "treeTabs.behavior.lockCtrlTabInPanel") {
        if (Services.prefs.getPrefType("treeTabs.behavior.lockCtrlTabInPanel") != 128) {
          Services.prefs.setBoolPref("treeTabs.behavior.lockCtrlTabInPanel", nativeTreeTabs.lockCtrlTabInPanel);
        } else {
          nativeTreeTabs.lockCtrlTabInPanel = Services.prefs.getBoolPref("treeTabs.behavior.lockCtrlTabInPanel");
        }
        return;
      }
      if (name === "treeTabs.behavior.switchSelectedOnClick") {
        if (Services.prefs.getPrefType("treeTabs.behavior.switchSelectedOnClick") != 128) {
          Services.prefs.setBoolPref("treeTabs.behavior.switchSelectedOnClick", nativeTreeTabs.switchSelectedOnClick);
        } else {
          nativeTreeTabs.switchSelectedOnClick = Services.prefs.getBoolPref("treeTabs.behavior.switchSelectedOnClick");
        }
        return;
      }
      if (name === "treeTabs.behavior.switchSelectedOnClickStayOnPanel") {
        if (Services.prefs.getPrefType("treeTabs.behavior.switchSelectedOnClickStayOnPanel") != 128) {
          Services.prefs.setBoolPref("treeTabs.behavior.switchSelectedOnClickStayOnPanel", nativeTreeTabs.switchSelectedOnClickStayOnPanel);
        } else {
          nativeTreeTabs.switchSelectedOnClickStayOnPanel = Services.prefs.getBoolPref("treeTabs.behavior.switchSelectedOnClickStayOnPanel");
        }
        return;
      }
      if (name === "treeTabs.behavior.hopOverUnloadedTabs") {
        if (Services.prefs.getPrefType("treeTabs.behavior.hopOverUnloadedTabs") != 128) {
          Services.prefs.setBoolPref("treeTabs.behavior.hopOverUnloadedTabs", nativeTreeTabs.hopOverUnloadedTabs);
        } else {
          nativeTreeTabs.hopOverUnloadedTabs = Services.prefs.getBoolPref("treeTabs.behavior.hopOverUnloadedTabs");
        }
        return;
      }
      if (name === "treeTabs.behavior.hopOverCollapsedTabs") {
        if (Services.prefs.getPrefType("treeTabs.behavior.hopOverCollapsedTabs") != 128) {
          Services.prefs.setBoolPref("treeTabs.behavior.hopOverCollapsedTabs", nativeTreeTabs.hopOverCollapsedTabs);
        } else {
          nativeTreeTabs.hopOverCollapsedTabs = Services.prefs.getBoolPref("treeTabs.behavior.hopOverCollapsedTabs");
        }
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


  initPreferences: function() {
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

    if (Services.prefs.getPrefType("treeTabs.behavior.switchSelectedOnClickStayOnPanel") != 128) {
      Services.prefs.setBoolPref("treeTabs.behavior.switchSelectedOnClickStayOnPanel", this.switchSelectedOnClickStayOnPanel);
    } else {
      this.switchSelectedOnClickStayOnPanel = Services.prefs.getBoolPref("treeTabs.behavior.switchSelectedOnClickStayOnPanel");
    }
    Services.prefs.addObserver("treeTabs.behavior.switchSelectedOnClickStayOnPanel", this);

    if (Services.prefs.getPrefType("treeTabs.behavior.hopOverUnloadedTabs") != 128) {
      Services.prefs.setBoolPref("treeTabs.behavior.hopOverUnloadedTabs", this.hopOverUnloadedTabs);
    } else {
      this.hopOverUnloadedTabs = Services.prefs.getBoolPref("treeTabs.behavior.hopOverUnloadedTabs");
    }
    Services.prefs.addObserver("treeTabs.behavior.hopOverUnloadedTabs", this);

    if (Services.prefs.getPrefType("treeTabs.behavior.hopOverCollapsedTabs") != 128) {
      Services.prefs.setBoolPref("treeTabs.behavior.hopOverCollapsedTabs", this.hopOverCollapsedTabs);
    } else {
      this.hopOverCollapsedTabs = Services.prefs.getBoolPref("treeTabs.behavior.hopOverCollapsedTabs");
    }
    Services.prefs.addObserver("treeTabs.behavior.hopOverCollapsedTabs", this);

    if (Services.prefs.getPrefType("treeTabs.defaultPanelName") != 32) {
      Services.prefs.setStringPref("treeTabs.defaultPanelName", this.defaultPanelName);
    } else {
      this.defaultPanelName = Services.prefs.getStringPref("treeTabs.defaultPanelName");
    }
    if (Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent") === false) {
      this.moveNewTabsDirectlyUnderParent = false;
    }
    Services.prefs.addObserver("browser.tabs.insertRelatedAfterCurrent", this);

    Services.prefs.setBoolPref("browser.tabs.dragDrop.createGroup.enabled", false);
    Services.prefs.setBoolPref("browser.tabs.groups.smart.enabled", false);
    Services.prefs.setBoolPref("svg.context-properties.content.enabled", true);

  },

  defaultFunctionWrap: function() {
    //Focus on previous (upper) tab when a tab closes
    // if no children exist.
    //  Makes use of browser.tabs.selectOwnerOnClose
    // Wrapper is used because the selected tab changes
    //  before the closing tab is fully closed
    this.originalRemoveTab = gBrowser.removeTab;
    gBrowser.removeTab = function(aTab, aOptions) {

      function checkForNextInPanel(aTab) {
        //Don't select another panel(hidden one) tabs if a not hidden pinned tab exists
        let newowner = window.gBrowser.tabContainer.findNextTab(aTab, {
          direction: 1,
          wrap: false,
          filter: tab => tabVisible(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
        });
        if (newowner == null) {
          newowner = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: -1,
            wrap: false,
            filter: tab => tabVisible(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
          });
        }
        if (nativeTreeTabs.hopOverUnloadedTabs == true) {
          if (newowner == null) {
            //last chance will go to another panel
            newowner = window.gBrowser.tabContainer.findNextTab(aTab, {
              direction: -1,
              wrap: true,
              filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab),
            });
          }
        }
        //second try stay in panel even if tab is hidden (for example collapsed group)?
        if (newowner == null) {
          newowner = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: 1,
            wrap: false,
            filter: tab => visibleOrInGroup(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
          });
        }
        if (newowner == null) {
          newowner = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: -1,
            wrap: false,
            filter: tab => visibleOrInGroup(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
          });
        }

        if (newowner) {
          gBrowser.setSuccessor(aTab, newowner);
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
          let focusNext = (nextTab && unloadedCheck(nextTab) && getTreeDepth(nextTab) >= tabDepth) ?
            true : false;
          if (focusNext) {
            gBrowser.setSuccessor(aTab, nextTab);
          } else if (tabDepth != 0 && unloadedCheck(previousTab)) {
            gBrowser.setSuccessor(aTab, previousTab);
          }
          //Don't select another panel(hidden one) tabs
          if (!nextTab || (nextTab && (nextTab.hasAttribute("tabPanel-hidden") || !unloadedCheck(previousTab)))) {
            if (!previousTab.hasAttribute("tabPanel-hidden") && unloadedCheck(previousTab) && tabVisible(previousTab)) {
              gBrowser.setSuccessor(aTab, previousTab);
            } else {
              checkForNextInPanel(aTab);
            }
          }
        } else if (nextTab && (nextTab.hasAttribute("tabPanel-hidden") || !unloadedCheck(nextTab))) {
          checkForNextInPanel(aTab);
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
    //(don't select next panel tabs if locked)
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
        if (!startTab) {
          nativeTreeTabs.originalAdvanceSelectedTab.apply(this, arguments);
          return;
        }
        if (nativeTreeTabs.lockCtrlTabInPanel === false) {
          //Cycles all panels
          let nextTab;
          if (startTab.pinned) {
            nextTab = this.findNextTab(startTab, {
              direction: aDir,
              wrap: false,
              filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
            });
          } else {
            // nextTab = (aDir == 1) ? (getNextTab(startTab) : getPreviousTab(startTab);
            nextTab = this.findNextTab(startTab, {
              direction: aDir,
              wrap: false,
              filter: tab => tabVisible(tab) && unloadedCheck(tab),
            });
          }
          let startTabPanelId = startTab.getAttribute("panel-id");
          if (nextTab == null || (nextTab.hasAttribute("panel-id") && nextTab.getAttribute("panel-id") != startTabPanelId)) {
            //Move from last tab of panel to the first tab of the next one INCLUDING pinned tabs
            let startTabPanelIndex = nativeTreeTabs.tabPanels.findIndex(x => x.id.toString() === startTabPanelId);
            if (aDir == -1) {
              //possible pin tab on panel still exists
              //only on up direction check
              //(pins are on top)
              let possiblePin = this.findNextTab(startTab, {
                direction: aDir,
                wrap: false,
                filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab) && tab.getAttribute("panel-id") === startTabPanelId,
              });
              if (possiblePin == null) {
                possiblePin = this.findNextTab(startTab, {
                  direction: aDir,
                  wrap: false,
                  filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && tab.getAttribute("panel-id") === startTabPanelId,
                });
              }
              if (possiblePin && possiblePin != startTab) {
                this._selectNewTab(possiblePin, aDir, aWrap);
                return;
              }
            }
            let nextPanelId
            let nextPanelIndex;
            if (aDir == 1) {
              nextPanelIndex = (startTabPanelIndex === nativeTreeTabs.tabPanels.length - 1) ? 0 : startTabPanelIndex + 1;
            } else {
              nextPanelIndex = (startTabPanelIndex === 0) ? nativeTreeTabs.tabPanels.length - 1 : startTabPanelIndex - 1;
            }
            while (nextPanelIndex != startTabPanelIndex) {
              nextPanelId = nativeTreeTabs.tabPanels[nextPanelIndex].id.toString();
              if (aDir == 1) {
                nextPanelTab = this.allTabs.find(tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab) && tab.getAttribute("panel-id") === nextPanelId);
                if (nextPanelTab == null) {
                  nextPanelTab = this.allTabs.find(tab => visibleOrInGroup(tab) && unloadedCheck(tab) && tab.getAttribute("panel-id") === nextPanelId);
                }
              } else {
                nextPanelTab = this.allTabs.findLast(tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab) && tab.getAttribute("panel-id") === nextPanelId);
                if (nextPanelTab == null) {
                  nextPanelTab = this.allTabs.findLast(tab => visibleOrInGroup(tab) && unloadedCheck(tab) && tab.getAttribute("panel-id") === nextPanelId);
                }
              }
              if (nextPanelTab && nextPanelTab != startTab) {
                this._selectNewTab(nextPanelTab, aDir, aWrap);
                return;
              }
              if (aDir == 1) {
                nextPanelIndex++;
              } else {
                nextPanelIndex--;
              }
              if (nextPanelIndex == nativeTreeTabs.tabPanels.length) {
                nextPanelIndex = 0;
              } else if (nextPanelIndex == -1) {
                nextPanelIndex = nativeTreeTabs.tabPanels.length - 1;
              }
            }
          }
          // if (startTab.pinned) {
          //   if (nextTab && nextTab != startTab) {
          //     this._selectNewTab(nextTab, aDir, aWrap);
          //     return;
          //   }
          //   return;
          // }
        }
        let newTab = null;
        if (startTab.hidden) {
          if (aDir == 1) {
            newTab = this.allTabs.find(tab => tabVisible(tab) && !tab.hasAttribute("tabPanel-hidden"));
          } else {
            newTab = this.allTabs.findLast(tab => tabVisible(tab) && !tab.hasAttribute("tabPanel-hidden"));
          }
        } else {
          newTab = this.findNextTab(startTab, {
            direction: aDir,
            wrap: aWrap,
            filter: tab => tabVisible(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
          });
          if (newTab == null) {
            newTab = this.findNextTab(startTab, {
              direction: aDir,
              wrap: true,
              filter: tab => tabVisible(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
            });
          }
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

    this.original_findTabToBlurTo = gBrowser._findTabToBlurTo;
    gBrowser._findTabToBlurTo = function(aTab, aExcludeTabs = []) {
      try {
        if (!aTab.selected) {
          return null;
        }
        if (FirefoxViewHandler.tab) {
          aExcludeTabs.push(FirefoxViewHandler.tab);
        }

        let excludeTabs = new Set(aExcludeTabs);

        // If this tab has a successor, it should be selectable, since
        // hiding or closing a tab removes that tab as a successor.
        if (aTab.successor && !excludeTabs.has(aTab.successor)) {
          return aTab.successor;
        }

        if (aTab && aTab.owner != null && tabVisible(aTab.owner) &&
          !excludeTabs.has(aTab.owner) &&
          Services.prefs.getBoolPref("browser.tabs.selectOwnerOnClose")
        ) {
          return aTab.owner;
        }

        // Try to find a remaining tab that comes after the given tab
        let remainingTabs = Array.prototype.filter.call(
          this.visibleTabs,
          tab => !excludeTabs.has(tab)
        );

        if (Services.prefs.getBoolPref("browser.tabs.selectMRUOnClose", false)) {
          let mruTab = remainingTabs
            .filter(t => t !== aTab)
            .reduce(
              (best, t) =>
              !best || t.lastAccessed > best.lastAccessed ? t : best,
              null
            );
          if (mruTab) {
            return mruTab;
          }
        }


        let tab = this.tabContainer.findNextTab(aTab, {
          direction: 1,
          filter: _tab => remainingTabs.includes(_tab) && unloadedCheck(_tab) && !_tab.hasAttribute("tabPanel-hidden"),
        });

        if (tab == null) {
          tab = this.tabContainer.findNextTab(aTab, {
            direction: -1,
            filter: _tab => remainingTabs.includes(_tab) && unloadedCheck(_tab) && !_tab.hasAttribute("tabPanel-hidden"),
          });
        }

        if (tab) {
          return tab;
        }

        // If no qualifying visible tab was found, see if there is a tab in
        // a collapsed tab group that could be selected.
        let eligibleTabs = new Set(this.tabsInCollapsedTabGroups).difference(
          excludeTabs
        );

        tab = this.tabContainer.findNextTab(aTab, {
          direction: 1,
          filter: _tab => eligibleTabs.has(_tab) && unloadedCheck(_tab) && !_tab.hasAttribute("tabPanel-hidden"),
        });

        if (!tab) {
          tab = this.tabContainer.findNextTab(aTab, {
            direction: -1,
            filter: _tab => eligibleTabs.has(_tab) && unloadedCheck(_tab) && !_tab.hasAttribute("tabPanel-hidden"),
          });
        }

        if (tab) {
          return tab;
        }

        tab = this.tabContainer.findNextTab(aTab, {
          direction: -1,
          filter: _tab => remainingTabs.includes(_tab),
        });

        if (!tab) {
          tab = this.tabContainer.findNextTab(aTab, {
            direction: 1,
            filter: _tab => remainingTabs.includes(_tab),
          });
        }

        if (tab) {
          return tab;
        }

        tab = this.tabContainer.findNextTab(aTab, {
          direction: -1,
          filter: _tab => eligibleTabs.has(_tab),
        });

        if (!tab) {
          tab = this.tabContainer.findNextTab(aTab, {
            direction: 1,
            filter: _tab => eligibleTabs.has(_tab),
          });
        }
        return tab;
      } catch (error) {
        console.error(error);
        nativeTreeTabs.original_findTabToBlurTo.apply(this, arguments);
        return;
      }
    };

    //Close pinned tab from keyboard selects next in panel if possible
    // og function selects next tab
    this.originalCloseTabOrWindow = BrowserCommands.closeTabOrWindow;
    BrowserCommands.closeTabOrWindow = function(event) {
      try {
        if (event &&
          (event.ctrlKey || event.metaKey || event.altKey) &&
          gBrowser.selectedTab.pinned
        ) {
          gBrowser.tabContainer.advanceSelectedTab(1, true);
          return;
        }
        nativeTreeTabs.originalCloseTabOrWindow.apply(this, arguments);

      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalCloseTabOrWindow.apply(this, arguments);
        return;
      }
    };

    this.original_getTabsToTheEndFrom = gBrowser._getTabsToTheEndFrom;
    gBrowser._getTabsToTheEndFrom = function(aTab) {
      try {
        let tabsToEnd = [];
        if (!tabVisible(aTab)) {
          return tabsToEnd;
        }
        let tabs = this.openTabs;
        for (let i = tabs.length - 1; i >= 0; --i) {
          if (tabs[i] == aTab) {
            break;
          }
          // Ignore pinned and hidden tabs.
          if (tabs[i].pinned || tabs[i].hidden || tabs[i].hasAttribute("tabPanel-hidden")) {
            continue;
          }
          // In a multi-select context, select all unselected tabs
          // starting from the context tab.
          if (aTab.multiselected && tabs[i].multiselected) {
            continue;
          }
          tabsToEnd.push(tabs[i]);
        }
        return tabsToEnd;
      } catch (error) {
        console.error(error);
        nativeTreeTabs.original_getTabsToTheEndFrom.apply(this, arguments);
        return;
      }
    };

    this.original_getTabsToTheStartFrom = gBrowser._getTabsToTheStartFrom;
    gBrowser._getTabsToTheStartFrom = function(aTab) {
      try {

        let tabsToStart = [];
        if (!tabVisible(aTab)) {
          return tabsToStart;
        }
        let tabs = this.openTabs;
        for (let i = 0; i < tabs.length; ++i) {
          if (tabs[i] == aTab) {
            break;
          }
          // Ignore pinned and hidden tabs.
          if (tabs[i].pinned || tabs[i].hidden || tabs[i].hasAttribute("tabPanel-hidden")) {
            continue;
          }
          // In a multi-select context, select all unselected tabs
          // starting from the context tab.
          if (aTab.multiselected && tabs[i].multiselected) {
            continue;
          }
          tabsToStart.push(tabs[i]);
        }
        return tabsToStart;
      } catch (error) {
        console.error(error);
        nativeTreeTabs.original_getTabsToTheStartFrom.apply(this, arguments);
        return;
      }
    };

    this.originalRemoveAllTabsBut = gBrowser.removeAllTabsBut;
    gBrowser.removeAllTabsBut = function(aTab, aParams = {}) {
      try {
        let {
          skipWarnAboutClosingTabs = false,
            skipPinnedOrSelectedTabs = true,
        } = aParams;

        /** @type {function(MozTabbrowserTab):boolean} */
        let filterFn;

        // If enabled also filter by selected or pinned state.
        if (skipPinnedOrSelectedTabs) {
          if (aTab != null && aTab.multiselected) {
            filterFn = tab => !tab.multiselected && !tab.pinned && tabVisible(tab) && !tab.hasAttribute("tabPanel-hidden");
          } else {
            filterFn = tab => tab != aTab && !tab.pinned && tabVisible(tab) && !tab.hasAttribute("tabPanel-hidden");
          }
        } else {
          // Exclude just aTab from being removed.
          filterFn = tab => tab != aTab;
        }

        let tabsToRemove = this.openTabs.filter(filterFn);

        // If enabled show the tab close warning.
        if (!skipWarnAboutClosingTabs &&
          !this.warnAboutClosingTabs(
            tabsToRemove.length,
            this.closingTabsEnum.OTHER
          )
        ) {
          return;
        }
        this.removeTabs(tabsToRemove, aParams);
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalRemoveAllTabsBut.apply(this, arguments);
        return;
      }
    };
  },

  addTabGroupCreateListeners: function() {
    //renames group to last right clicked tab label, on creation
    let groupPopup = document.getElementById("tab-group-editor").querySelector(["panel"]);
    if (groupPopup) {
      groupPopup.addEventListener("popupshowing", function(aEvent) {
        let panel = aEvent.target;
        let input = panel.querySelector("#tab-group-name");
        if (input && input.value === "") {
          if (TabContextMenu.contextTab) {
            let newTitle = TabContextMenu.contextTab.label;
            input.value = newTitle;
            if (TabContextMenu.contextTab.group) {
              TabContextMenu.contextTab.group.label = newTitle;
            }
          }
        }
      }, true);
    }
  },

  afterTabsForPanelMove: function(tabs, panel, group = false) {
    tabs.forEach(function(cTab) {
      setPanel(cTab, panel, window);
      if (cTab.hasAttribute("new-tree-depth")) {
        let newParent = cTab.getAttribute("new-tree-parent");
        if (newParent != null) {
          let parentTab = tabs.find(x => x.getAttribute("tree-id") === newParent);
          setOpener(cTab, parentTab);
          cTab.removeAttribute("new-tree-parent");
        }
        setTreeDepth(cTab, cTab.getAttribute("new-tree-depth"));
        cTab.removeAttribute("new-tree-depth");
      } else if (!group && !cTab.hasAttribute("hidden-child")) {
        setTreeDepth(cTab, 0);
        removeOpener(cTab);
      }
      if (!group && cTab.hasAttribute("twisted-root")) {
        let twistedDepth = getTreeDepth(cTab);
        let nextTab = cTab.nextSibling
        let depthFix = getTreeDepth(nextTab);
        while (isTab(nextTab)) {
          //Add hidden children
          if (nextTab.hasAttribute("hidden-child")) {
            let newDepth = twistedDepth + 1 + depthFix - getTreeDepth(nextTab);
            setTreeDepth(nextTab, newDepth);
          } else {
            break;
          }
          nextTab = nextTab.nextSibling;
        }
      }
      cTab.removeAttribute("skipMoveForced");
    }, this);
  },

  prepareTabsForPanelMove: function(tabs, group = false) {
    let newArray = tabs.slice();
    tabs.forEach(function(cTab, index) {
      if (cTab.hasAttribute("twisted-root")) {
        let nextTab = cTab.nextSibling
        while (isTab(nextTab)) {
          //Add hidden children
          if (nextTab.hasAttribute("hidden-child")) {
            if (!tabs.includes(nextTab)) {
              newArray.splice(index + 1 + (newArray.length - tabs.length), 0, nextTab);
            }
            nextTab.setAttribute("skipMoveForced", "true");
          } else {
            break;
          }
          nextTab = nextTab.nextSibling;
        }
      }
      if (!group) {
        let root = getRootTab(cTab);
        while (isTab(root)) {
          if (tabs.includes(root)) {
            let rootlDepth = (root.hasAttribute("new-tree-depth")) ? root.getAttribute("new-tree-depth") : getTreeDepth(root);
            cTab.setAttribute("new-tree-depth", parseInt(rootlDepth, 10) + 1);
            cTab.setAttribute("new-tree-parent", root.getAttribute("tree-id"));
            break;
          }
          root = getRootTab(root);
        }
        cTab.setAttribute("skipMoveForced", "true");
      }
    }, this);

    if (!group) {
      tabs.slice().reverse().forEach(function(cTab, index) {
        if (!cTab.hasAttribute("twisted-root") && !cTab.hasAttribute("hidden-child")) {
          this.tabLeaveStrip(cTab);
        }
      }, this);
    }
    return newArray;
  },

  addDefaultPanel: function() {
    let panel0 = {
      "id": "0",
      "count": 0,
      "label": this.defaultPanelName,
      "selectedTab": null,
      "previousSelectedTab": new Array()
    };
    this.tabPanels.push(panel0);
    this.selectedtPanel = panel0;
  },

  tabPanelOpen: function(tabs = null, label = null, id = null, forceShow = false, index = null, group = false) {
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
      "selectedTab": null,
      "previousSelectedTab": new Array()
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
      tabs = this.prepareTabsForPanelMove(tabs, group);
      let lastTab = gBrowser.tabs[gBrowser.tabs.length - 1];
      //extreme case, group last => move last
      try {
        nativeTreeTabs.moveTabsAfter(tabs, lastTab);
      } catch (error) {
        console.error(error);
      }
      let saveSelectedTab;
      if (tabs.includes(window.gBrowser.selectedTab)) {
        //save in case of last panel closing
        // which will change the selected tab
        saveSelectedTab = window.gBrowser.selectedTab;
      }
      this.afterTabsForPanelMove(tabs, newPanel, group);
      tabs.forEach(function(cTab) {
        //Special Case
        // if (cTab === lastTab && !group) {
        //   setTreeDepth(cTab, 0);
        //   removeOpener(cTab);
        // }
        if (show) {
          unHideTab(cTab);
        } else {
          hideTab(cTab);
        }
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

  moveTabsAfter: function(tabs, position, makeSureNoGroup = true) {
    if (position.splitview) {
      position = position.splitview;
    }
    if (makeSureNoGroup && position.group) {
      position = position.group;
    }
    gBrowser.moveTabsAfter(this.filterGroups(tabs), position);
  },

  moveTabsBefore: function(tabs, position, makeSureNoGroup = true) {
    if (position.splitview) {
      position = position.splitview;
    }
    if (makeSureNoGroup && position.group) {
      position = position.group;
    }
    gBrowser.moveTabsBefore(this.filterGroups(tabs), position);
  },

  moveTabBefore: function(tab, position) {
    //Move tab but not inside group
    if (position.splitview) {
      position = position.splitview;
    }
    if (position.group) {
      position = position.group;
    }
    gBrowser.moveTabBefore(tab, position);
  },

  moveTabAfter: function(tab, position) {
    //Move tab but not inside group
    if (position.splitview) {
      position = position.splitview;
    }
    if (position.group) {
      position = position.group;
    }
    gBrowser.moveTabAfter(tab, position);
  },

  movePanel: function(panelId, beforePanelId) {
    panelId = panelId.toString();
    let panel = this.tabPanels.find(x => x.id.toString() === panelId);
    if (!panel) {
      return;
    }
    let position;
    let beforePanel;
    let indexOfBeforePanel;
    let afterMove = false;
    if (beforePanelId != null) {
      beforePanelId = beforePanelId.toString();
      beforePanel = this.tabPanels.find(x => x.id.toString() === beforePanelId);
      if (!beforePanel) {
        return;
      }
      //first tab of the before panel
      let pTab = gBrowser.tabs.find(tab => !tab.pinned && tab.hasAttribute("panel-id") && tab.getAttribute("panel-id") === beforePanelId);

      if (!isTab(pTab)) {
        //check for pinned tabs
        pTab = gBrowser.tabs.find(tab => tab.pinned && tab.hasAttribute("panel-id") && tab.getAttribute("panel-id") === beforePanelId);
        if (!isTab(pTab)) {
          return;
        }
        indexOfBeforePanel = nativeTreeTabs.tabPanels.indexOf(beforePanel);
        if (indexOfBeforePanel === nativeTreeTabs.tabPanels.length - 1) {
          //last
          position = null;
        } else {
          while (position == null || indexOfBeforePanel > 0) {
            let previousBeforePanel = this.tabPanels[indexOfBeforePanel - 1];
            let previousBeforePanelId = previousBeforePanel.id.toString();
            pTab = gBrowser.tabs.find(tab => !tab.pinned && tab.hasAttribute("panel-id") && tab.getAttribute("panel-id") === previousBeforePanelId);
            if (isTab(pTab)) {
              position = pTab;
              afterMove = true;
              break;
            }
            indexOfBeforePanel--;
          }
          if (position == null) {
            //top of tab strip move
            position = window.gBrowser.tabs[window.gBrowser.pinnedTabCount];
            if (position.getAttribute("panel-id") === panelId) {
              return;
            }
          }
        }

      } else {
        position = pTab;
      }
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
      indexOfBeforePanel = nativeTreeTabs.tabPanels.indexOf(beforePanel);
      //downwards move
      if (indexOfBeforePanel > indexOfPanel) {
        indexOfBeforePanel = indexOfBeforePanel - 1;
      }
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, indexOfBeforePanel);
      if (position != null && tabsToMove.length != 0) {
        if (afterMove == false) {
          nativeTreeTabs.moveTabsBefore(tabsToMove, position);
        } else {
          nativeTreeTabs.moveTabsAfter(tabsToMove, position);
        }
      }

    } else {
      let lastIndex = nativeTreeTabs.tabPanels.length - 1;
      let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, lastIndex);
      if (tabsToMove.length != 0) {
        nativeTreeTabs.moveTabsAfter(tabsToMove, gBrowser.tabs[gBrowser.tabs.length - 1]);
      }
    }
    tabsToMove.forEach(function(cTab) {
      cTab.removeAttribute("skipMoveForced");
    }, this);
  },

  tabPanelShow: function(panel, changeSelectedTab = true) {
    let panelId;
    if (panel.id) {
      if (!this.tabPanels.includes(panel)) {
        panel = null;
      } else {
        panelId = panel.id.toString();
      }
    } else {
      panelId = panel.toString();
      panel = this.tabPanels.find(x => x.id.toString() === panelId);
    }
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
          if (panelTopTab == null && ((tabVisible(aTab) || inNoCollapsedGroup(aTab)) && unloadedCheck(aTab))) {
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
      let pSTab = panel.selectedTab;
      if (pSTab == null || pSTab.getAttribute("panel-id") != panel.id || !window.gBrowser.tabs.includes(pSTab) || !(tabVisible(pSTab) || inNoCollapsedGroup(pSTab))) {
        while (panel.previousSelectedTab.length > 0 && (pSTab == null || (!window.gBrowser.tabs.includes(pSTab) || pSTab.getAttribute("panel-id") != panel.id || !(tabVisible(pSTab) || inNoCollapsedGroup(pSTab))))) {
          pSTab = panel.previousSelectedTab.pop();
        }
      }
      if (pSTab && window.gBrowser.tabs.includes(pSTab) && (tabVisible(pSTab) || inNoCollapsedGroup(pSTab)) && unloadedCheck(pSTab) &&
        pSTab.getAttribute("panel-id") === panelId) {
        window.gBrowser.selectedTab = pSTab;
      } else if (panelTopTab != null) {
        window.gBrowser.selectedTab = panelTopTab;
      } else {
        let findTab = window.gBrowser.tabContainer.allTabs.find(tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab) && tab.getAttribute("panel-id") === panelId);
        if (findTab == null) {
          findTab = window.gBrowser.tabContainer.allTabs.find(tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && tab.getAttribute("panel-id") === panelId);
        }
        if (findTab == null) {
          findTab = window.gBrowser.tabContainer.allTabs.find(tab => tab.getAttribute("panel-id") === panelId);
        }
        if (findTab == null) {
          let newTab = window.gBrowser.addTab(
            window.BROWSER_NEW_TAB_URL, {
              triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
            }
          );
          if (!newTab) {
            throw new Error("Could not open new tab.");
          }
          setPanel(newTab, panel, window);
          window.gBrowser.selectedTab = newTab;
        } else {
          window.gBrowser.selectedTab = findTab;
        }
      }
    }
  },
  cycleTabPanels: function(dir = 1) {
    if (this.tabPanels.length < 2) {
      return;
    }
    let nextPanelIndex = this.tabPanels.indexOf(this.selectedtPanel) + dir;
    if (nextPanelIndex > this.tabPanels.length - 1) {
      nextPanelIndex = 0;
    } else if (nextPanelIndex < 0) {
      nextPanelIndex = this.tabPanels.length - 1;
    }
    this.tabPanelShow(this.tabPanels[nextPanelIndex])
  },

  moveTabsToPanel: function(tabsToMove, panel, forceShow = false, group = false) {
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
      tabsToMove = this.prepareTabsForPanelMove(tabsToMove, group);
      //Force select the new panel when switching
      // if the selected tab is set to move
      // Check before setting the panel, because 
      // the selected tab might change (if the panel closes)
      let saveSelectedTab;
      if (tabsToMove.includes(gBrowser.selectedTab)) {
        saveSelectedTab = gBrowser.selectedTab;
      }
      try {
        nativeTreeTabs.moveTabsAfter(tabsToMove, previousTab);
      } catch (error) {
        console.log(error)
      }
      this.afterTabsForPanelMove(tabsToMove, panel, group);
      if (saveSelectedTab != null) {
        gBrowser.selectedTab = saveSelectedTab;
      }
      if (forceShow || tabsToMove.includes(gBrowser.selectedTab)) {
        this.tabPanelShow(panel, changeSelectedTab = false);
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
          this.tabPanelShow(this.previousSelectedPanel);
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
      if (this.previousSelectedPanel.selectedTab == null) {
        if (window.gBrowser.selectedTab.getAttribute("panel-id") == this.previousSelectedPanel.id.toString()) {
          this.previousSelectedPanel.selectedTab = window.gBrowser.selectedTab;
        }
      }
    }
    this.selectedtPanel = panel;
    checkPanelInMenu(panel);
  },

  indentTab: function(dir) {
    let tabs = (dir === "in") ? window.gBrowser.selectedTabs : window.gBrowser.selectedTabs.slice().reverse();
    tabs.forEach(function(aTab) {
      if (aTab.pinned || aTab.hasAttribute("tabPanel-hidden")) {
        return;
      }
      let rootTab = getRootTab(aTab);
      if (rootTab && rootTab.multiselected) {
        return;
      }
      // let aTab = window.gBrowser.selectedTab;
      let treeDepth = getTreeDepth(aTab);
      let previousTab = aTab.previousSibling;

      if (dir === "in") {
        if (isTab(previousTab) && !previousTab.hasAttribute("tabPanel-hidden")) {
          let previousTabDepth = getTreeDepth(previousTab);
          if (treeDepth + 1 < previousTabDepth + 2) {
            setTreeDepth(aTab, treeDepth + 1);
            setOpener(aTab, getRootTab(aTab));
            nativeTreeTabs.updateChildrenLite(aTab, treeDepth, andMultiselected = true);
          }
        }
      } else {
        let nextTab = aTab.nextSibling;
        if (isTab(nextTab) && !nextTab.hasAttribute("tabPanel-hidden")) {
          let nextTabDepth = getTreeDepth(nextTab);
          if (treeDepth == nextTabDepth && !nextTab.multiselected) {
            return;
          }
        }
        if (treeDepth > 0) {
          setTreeDepth(aTab, treeDepth - 1);
          setOpener(aTab, getRootTab(aTab));
          nativeTreeTabs.updateChildrenLite(aTab, treeDepth, andMultiselected = true);
        }
      }
    });
  },
  moveTab: function(dir) {
    let moveAll = false;
    let moveContext = {
      metricsContext: gBrowser.TabMetrics.userTriggeredContext(
        gBrowser.TabMetrics.METRIC_SOURCE.DRAG_AND_DROP
      )
    };
    let tabsToMove = new Array();
    let groupsToMove = new Array();
    let groupsChecked = new Array();

    window.gBrowser.selectedTabs.forEach(function(aTab) {
      if (aTab.hasAttribute("moving-by-key")) {
        return;
      }
      if (aTab.group) {
        if (!groupsChecked.includes(aTab.group)) {
          if (checkGroupRoots(aTab)) {
            groupsToMove.push(aTab.group);
            moveAll = true;
            aTab.setAttribute("moveWholeGroup", "");
            tabsToMove.push(aTab.group);
          } else {
            tabsToMove.push(aTab);
          }
          groupsChecked.push(aTab.group);
        } else if (!groupsToMove.includes(aTab.group)) {
          tabsToMove.push(aTab);
        }
      } else {
        tabsToMove.push(aTab);
      }
      aTab.setAttribute("moving-by-key", "true");
      let aTabDepth = getTreeDepth(aTab);
      let nextTab = aTab.nextSibling;
      while (isTab(nextTab)) {
        let nextTabDepth = getTreeDepth(nextTab);
        if (nextTabDepth != null && nextTabDepth <= aTabDepth) {
          break;
        }
        nextTab.setAttribute("moving-by-key", "true");
        nextTab = nextTab.nextSibling;
      }
    });
    //reverse order for top to bottom moving
    let tabs = (dir === "down") ? tabsToMove.slice().reverse() : tabsToMove;

    tabs.forEach(function(aTab) {
      let aTabDepth = getTreeDepth(aTab);

      if (moveAll) {
        //A whole tab group is selected
        // skip indent changes just hop over tabs
        // *for all selected (change this?)
        let prevPosition = aTab._tPos;
        let trueNextTab;
        let trueNextTabDepth;

        if (dir === "up") {
          let previousTab = getPreviousTab(aTab);
          while (previousTab && previousTab.hasAttribute("hidden-child")) {
            previousTab = getPreviousTab(previousTab);
          }
          if (isTab(previousTab) && !previousTab.hasAttribute("tabPanel-hidden") && !previousTab.hasAttribute("moving-by-key")) {
            let root = (getTreeDepth(previousTab) == 0) ? previousTab : getClosestZeroDepthTab(previousTab, "up");
            if (root != null) {
              if (aTab.tagName != "tab-group") {
                trueNextTab = getNextTab(aTab);
                trueNextTabDepth = (trueNextTab) ? getTreeDepth(trueNextTab) : null;
                if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
                  setTreeDepth(trueNextTab, 0);
                }
              } else {
                aTab.tabs.forEach(function(tab) {
                  tab.setAttribute("skipMoveForced", "true");
                }, this);
              }
              nativeTreeTabs.moveTabBefore(aTab, root);
            }
          }
        } else {
          let nextTab = getNextTab(aTab);

          if (aTab.tagName != "tab-group") {
            while (isTab(nextTab)) {
              nextTabDepth = getTreeDepth(nextTab);
              if (nextTabDepth <= aTabDepth || nextTab.hasAttribute("tabPanel-hidden")) {
                break;
              }
              nextTab = getNextTab(nextTab);
            }
          }
          if (nextTab && nextTab.hasAttribute("twisted-root")) {
            child = getNextTab(nextTab);
            while (child && (child.hasAttribute("hidden-child") || getTreeDepth(child) != 0)) {
              nextTab = child;
              child = getNextTab(nextTab);
            }
          }
          if (isTab(nextTab) && !nextTab.hasAttribute("tabPanel-hidden") && !nextTab.hasAttribute("moving-by-key")) {
            let lastTabInTree = getLastInTree(nextTab);
            if (lastTabInTree != null) {
              if (aTab.tagName != "tab-group") {
                trueNextTab = getNextTab(aTab);
                trueNextTabDepth = (trueNextTab) ? getTreeDepth(trueNextTab) : null;
                if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
                  setTreeDepth(trueNextTab, 0);
                }
              } else {
                aTab.tabs.forEach(function(tab) {
                  tab.setAttribute("skipMoveForced", "true");
                }, this);
              }
              nativeTreeTabs.moveTabAfter(aTab, lastTabInTree);
            }
          }
        }
        //move finished
        if (aTab.tagName != "tab-group") {
          setTreeDepth(aTab, 0);
          removeOpener(aTab);
          if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
            setTreeDepth(trueNextTab, trueNextTabDepth);
          }
          nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, aTabDepth, groupState = false, forceMultiselected = true);
        } else {
          aTab.tabs.forEach(function(tab) {
            tab.removeAttribute("skipMoveForced");
          }, this);
        }
        return;
      }

      if (dir === "up") {
        //move down or stick
        if (aTab._tPos > 0 || aTab.group) {
          let previousTab = getPreviousTab(aTab);
          while (previousTab && (previousTab.hasAttribute("moving-by-key") || previousTab.hasAttribute("hidden-child"))) {
            previousTab = getPreviousTab(previousTab);
          }

          if (isTab(previousTab) && !previousTab.hasAttribute("tabPanel-hidden") && !previousTab.hasAttribute("moving-by-key")) {
            //another case when moving out of group

            //leave previous group case
            let leavingGroup = (aTab.group && (!previousTab.group || aTab.group != previousTab.group));
            let enterGroup = (!aTab.group && previousTab.group);
            let previousTabDepth = getTreeDepth(previousTab);

            if (aTabDepth > previousTabDepth || leavingGroup || enterGroup) {
              let nextTab = getNextTab(aTab);
              let nextTabDepth = (nextTab) ? getTreeDepth(nextTab) : null;
              if (nextTabDepth && nextTabDepth > aTabDepth) {
                setTreeDepth(nextTab, 0);
              }
              // aTab.setAttribute("skipMoveForced","true");
              let prevPosition = aTab._tPos;
              if (enterGroup) {
                if (previousTab.group.collapsed) {
                  //hop over collapsed groups
                  gBrowser.moveTabBefore(aTab, previousTab.group);
                } else {
                  //enter a group case
                  gBrowser.moveTabAfter(aTab, previousTab.group.tabs[previousTab.group.tabs.length - 1], moveContext);
                }
              } else if (leavingGroup) {
                gBrowser.moveTabBefore(aTab, aTab.group);
              } else {
                gBrowser.moveTabBefore(aTab, previousTab);
              }
              if (enterGroup || leavingGroup) {
                setTreeDepth(aTab, 0);
                removeOpener(aTab);
              }
              if (previousTabDepth != null) {
                //special case if moving under tree
                setTreeDepth(aTab, previousTabDepth);
                copyOpener(aTab, previousTab);
              }
              // aTab.removeAttribute("skipMoveForced");
              if (nextTabDepth && nextTabDepth > aTabDepth) {
                setTreeDepth(nextTab, nextTabDepth);
              }
              // aTabDepth aTabDepth = getTreeDepth(aTab);
              nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, aTabDepth, groupState = false, forceMultiselected = true);
            } else if (aTabDepth < previousTabDepth) {
              setTreeDepth(aTab, previousTabDepth);
              setOpener(aTab, copyOpener(aTab, previousTab));
              nativeTreeTabs.updateChildrenLite(aTab, aTabDepth, andMultiselected = true);
            } else if (aTabDepth == previousTabDepth) {
              setTreeDepth(aTab, previousTabDepth + 1);
              setOpener(aTab, setOpener(aTab, previousTab));
              nativeTreeTabs.updateChildrenLite(aTab, aTabDepth, andMultiselected = true);
            }
          } else if (aTab.group) {
            let prevPosition = aTab._tPos;
            let nextTab = getNextTab(aTab);
            let nextTabDepth = (nextTab) ? getTreeDepth(nextTab) : null;
            if (nextTabDepth && nextTabDepth > aTabDepth) {
              setTreeDepth(nextTab, 0);
            }
            gBrowser.moveTabBefore(aTab, aTab.group, moveContext);
            setTreeDepth(aTab, 0);
            removeOpener(aTab);
            if (nextTabDepth && nextTabDepth > aTabDepth) {
              setTreeDepth(nextTab, nextTabDepth);
            }
            nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, aTabDepth, groupState = false, forceMultiselected = true);
          }
        }
      } else {
        //move down or unstick
        let nextTab = getNextTab(aTab);
        let nextTabDepth;
        while (isTab(nextTab)) {
          nextTabDepth = getTreeDepth(nextTab);
          if (nextTabDepth <= aTabDepth || nextTab.hasAttribute("tabPanel-hidden")) {
            break;
          }
          nextTab = getNextTab(nextTab);
        }
        while (nextTab && (nextTab.hasAttribute("moving-by-key") || nextTab.hasAttribute("hidden-child"))) {
          nextTab = getNextTab(nextTab);
        }
        if (isTab(nextTab) && !nextTab.hasAttribute("tabPanel-hidden") && !nextTab.hasAttribute("moving-by-key")) {

          let leavingGroup = (aTabDepth == 0 && aTab.group && (!nextTab.group || aTab.group != nextTab.group));
          let enterGroup = (!aTab.group && nextTab.group);
          if (aTabDepth == nextTabDepth || (aTabDepth == 0 && enterGroup) || leavingGroup) {
            let trueNextTab = getNextTab(aTab);
            let trueNextTabDepth = (trueNextTab) ? getTreeDepth(trueNextTab) : null;
            if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
              setTreeDepth(trueNextTab, 0);
            }
            // aTab.setAttribute("skipMoveForced","true");
            let prevPosition = aTab._tPos;
            if (enterGroup) {
              if (nextTab.group.collapsed) {
                //hop over collapsed groups
                gBrowser.moveTabAfter(aTab, nextTab.group, moveContext);
              } else {
                //enter a group case
                gBrowser.moveTabBefore(aTab, nextTab.group.tabs[0], moveContext);
              }
              setTreeDepth(aTab, 0);
              removeOpener(aTab);
            } else if (leavingGroup) {
              //leave previous group case
              gBrowser.moveTabAfter(aTab, aTab.group, moveContext);
            } else {
              gBrowser.moveTabAfter(aTab, nextTab);
              setTreeDepth(aTab, nextTabDepth + 1);
              setOpener(aTab, nextTab);
            }
            // aTab.removeAttribute("skipMoveForced");
            if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
              setTreeDepth(trueNextTab, trueNextTabDepth);
            }
            // aTabDepth = getTreeDepth(aTab);
            nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, aTabDepth, groupState = false, forceMultiselected = true);
            // nativeTreeTabs.updateChildrenLite(aTab, aTabDepth, andMultiselected = true);
            return;
          }
        }

        if (aTabDepth > 0 && (!isTab(nextTab) || (isTab(nextTab) && (aTabDepth > nextTabDepth || nextTab.hasAttribute("moving-by-key"))))) {
          setTreeDepth(aTab, aTabDepth - 1);
          setOpener(aTab, getRootTab(aTab));
          nativeTreeTabs.updateChildrenLite(aTab, aTabDepth, andMultiselected = true);
          return;
        }
        if (aTab.group) {
          let prevPosition = aTab._tPos;
          let trueNextTab = getNextTab(aTab);
          let trueNextTabDepth = (trueNextTab) ? getTreeDepth(trueNextTab) : null;
          if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
            setTreeDepth(trueNextTab, 0);
          }
          gBrowser.moveTabAfter(aTab, aTab.group, moveContext);
          // setTreeDepth(aTab, 0);
          // removeOpener(aTab);
          if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
            setTreeDepth(trueNextTab, trueNextTabDepth);
          }
          nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, aTabDepth, groupState = false, forceMultiselected = true);
          return
        }
      }
    });
    window.gBrowser.selectedTabs.forEach(function(aTab) {
      if (!aTab.hasAttribute("moving-by-key"))
        return;
      aTab.removeAttribute("moving-by-key");
      let aTabDepth = getTreeDepth(aTab);
      let nextTab = aTab.nextSibling;
      while (isTab(nextTab)) {
        let nextTabDepth = getTreeDepth(nextTab);
        if (nextTabDepth != null && nextTabDepth <= aTabDepth) {
          break;
        }
        nextTab.removeAttribute("moving-by-key");
        nextTab = nextTab.nextSibling;
      }
    });
  },
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

  // while (nextTab && (nextTab.splitview || nextTab.splitViewId)) {
  //   if (!isTab(nextTab) && nextTab.tagName != "tab-split-view-wrapper") return null;
  //   nextTab = nextTab.nextSibling;
  // }
  if (nextTab && nextTab.splitViewId) return nextTab.tabs[0];
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
  // while (previousTab && (previousTab.splitview || previousTab.splitViewId)) {
  //   if (!isTab(previousTab) && previousTab.tagName != "tab-split-view-wrapper") return null;
  //   previousTab = previousTab.previousSibling;
  // }
  if (previousTab && previousTab.splitViewId) return previousTab.tabs[1];
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
    if (!aTab.group.hasAttribute("save-state-collapsed"))
      aTab.group.setAttribute("save-state-collapsed", aTab.group.collapsed.toString());
    aTab.group.collapsed = true;
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
    if (aTab.group.hasAttribute("save-state-collapsed")) {
      let unroll = aTab.group.getAttribute("save-state-collapsed");
      if (unroll == "false") {
        aTab.group.collapsed = false;
      }
      aTab.group.removeAttribute("save-state-collapsed");
    }
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

inNoCollapsedGroup = function(aTab) {
  if (aTab.group && aTab.group.hasAttribute("save-state-collapsed") && aTab.group.getAttribute("save-state-collapsed") == "false")
    return true;
  return false;
}

visibleOrInGroup = function(aTab) {
  if (tabVisible(aTab) || aTab.group)
    return true;
  return false;
}

tabVisible = function(aTab) {
  if (aTab.hasAttribute("hidden-child") && nativeTreeTabs.hopOverCollapsedTabs) {
    return false;
  }
  return aTab.visible;
}

unloadedCheck = function(aTab) {
  if (nativeTreeTabs.hopOverUnloadedTabs == false)
    return true;
  if (!aTab.linkedPanel || aTab.hasAttribute("discarded"))
    return false;
  return true;
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

function checkGroupRoots(aTab) {
  if (!aTab.group) {
    return false;
  }
  let allIn = aTab.group.tabs.find(x => getTreeDepth(x) == 0 && (!x.multiselected && !x.selected));
  if (allIn == null) {
    return true;
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

menuItemClick = function(aEvent, panel, target) {
  let button = aEvent.button;
  if (button != 0) {
    return;
  }
  nativeTreeTabs.tabPanelShow(panel);
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

  // menuitem.addEventListener("click", (aEvent) => menuItemClick(aEvent, panel, aEvent.target));
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
  let menuitem = menupopup.querySelector('[panel-id="' + panel.id.toString() + '"]');
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

  let tabGroupMoveToWindow = document.getElementById("tabGroupEditor_moveGroupToNewWindow");
  if (tabGroupMoveToWindow) {

    let tabGroupMoveToPanel = document.createXULElement("menu");
    tabGroupMoveToPanel.setAttribute("id", "custom-tab-submenu");
    tabGroupMoveToPanel.setAttribute("label", "Move to Panel...");
    tabGroupMoveToPanel.setAttribute("accesskey", "a");


    let groupSubPopup = document.createXULElement("menupopup");
    groupSubPopup.setAttribute("id", "tabgroup-context-panel-actions");
    addMenuItem(groupSubPopup, "Create New Panel", (aTab, aEvent) => {
      let forceShow = (aEvent.ctrlKey) ? true : false;
      let group = gBrowser.tabGroupMenu.activeGroup.tabs.slice();
      group.forEach(function(tab) {
        tab.setAttribute("skipMoveForced", true);
      });
      window.nativeTreeTabs.tabPanelOpen(group, label = null, id = null, forceShow, index = null, true);
      group.forEach(function(tab) {
        tab.removeAttribute("skipMoveForced");
      });

      setTimeout(() => {
        gBrowser.tabGroupMenu.close();
      }, 30);
      panelNameRightClick();
    }, isToggle = false, id = "tab-context-create-new-panel");


    groupSubPopup.addEventListener("popupshowing", function(aEvent) {
      while (groupSubPopup.childNodes.length > 1) {
        groupSubPopup.removeChild(groupSubPopup.lastChild);
      }
      window.nativeTreeTabs.tabPanels.forEach(function(panel) {
        let item = addMenuItem(groupSubPopup, "" + panel.label, (aTab, aEvent) => {
          let forceShow = (aEvent.ctrlKey) ? true : false;
          let group = gBrowser.tabGroupMenu.activeGroup.tabs.slice();
          group.forEach(function(tab) {
            tab.setAttribute("skipMoveForced", true);
          });
          window.nativeTreeTabs.moveTabsToPanel(group, panel, forceShow, true);
          group.forEach(function(tab) {
            tab.removeAttribute("skipMoveForced");
          });
          setTimeout(() => {
            gBrowser.tabGroupMenu.close();
          }, 30);
        }, isToggle = false, id = "moveTo-panel-" + panel.id.toString());
        if (panel === window.nativeTreeTabs.selectedtPanel) {
          item.disabled = true;
        }
      });
    }, true);
    tabGroupMoveToPanel.appendChild(groupSubPopup);
    tabGroupMoveToWindow.parentNode.insertBefore(tabGroupMoveToPanel, tabGroupMoveToWindow);
  }

}

searchTabs = function() {
  gTabsPanel.searchTabs();
}

addNTTSidebarHeader = function() {
  let mainDiv = document.createElement("div");
  mainDiv.setAttribute("id", "NTT-header");
  //Insert on top of sidebar
  let sidebarMain = document.querySelector(["sidebar-main"]);
  sidebarMain.parentNode.insertBefore(mainDiv, sidebarMain);
  addTabPanelButton(mainDiv);

  let searchButton = document.createElement("div");
  searchButton.setAttribute("id", "search-all-tabs-button");

  searchButton.setAttribute("class", "button-background");
  let buttonImage = document.createElement("image");

  searchButton.appendChild(buttonImage);

  // mainDiv.appendChild(searchButton);
  searchButton.addEventListener("click", function(aEvent) {
    let button = aEvent.button;
    if (button != 0) {
      return;
    }
    searchTabs();
  });
}


addTabPanelButton = function(mainDiv) {
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
  mainDiv.appendChild(tabPanelGroup);

  //Create popup
  let menupopup = document.createXULElement('panel');
  menupopup.setAttribute('id', 'tab-panels-menupopup');
  menupopup.setAttribute('type', 'arrow');
  menupopup.setAttribute('class', 'panel-no-padding');
  menupopup.setAttribute('orient', 'vertical');
  menupopup.setAttribute('position', 'after_start');

  let panelMenuMainDiv = document.createElement('div');
  panelMenuMainDiv.setAttribute('id', 'tab-panels-menupopup-view');

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
  panelMenuMainDiv.appendChild(subDiv);
  menupopup.appendChild(panelMenuMainDiv);

  subDiv.addEventListener("click", (aEvent) => addNewPanelInput(aEvent, menupopup));

  let isDragging = false;
  let draggedItem = null;
  let previousNextitem = null;
  let helddown = 0;
  let dragStartPos;
  panelMenuMainDiv.addEventListener("mousedown", (aEvent) => {
    let button = aEvent.button;
    if (button != 0) {
      return;
    }
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
      document.addEventListener("mouseup", handleMouseUp, true);
    }
  });

  handleMousemove = function(aEvent) {
    if (isDragging && draggedItem) {
      helddown++;
      let itemSibilings = Array.from(panelMenuMainDiv.querySelectorAll("#tab-panels-menupopup-view > menuitem:not(.dragging)"));
      let nextItem = itemSibilings.find((sibiling) => {
        return (
          aEvent.clientY - panelMenuMainDiv.getBoundingClientRect().top <=
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
      panelMenuMainDiv.insertBefore(draggedItem, nextItem);
    } else {
      document.removeEventListener("mousemove", handleMousemove);
    }
  }

  function dragEnds(clickOnly = false) {
    if (draggedItem) {
      draggedItem.style.background = "";
      draggedItem.classList.remove("dragging");
      isDragging = false;

      //Move whole panel tabs in tab strip
      let panelId = draggedItem.getAttribute("panel-id");

      let dragEndPos = Array.prototype.indexOf.call(draggedItem.parentNode.children, draggedItem) - 1;

      if (clickOnly) {
        nativeTreeTabs.tabPanelShow(panelId);
        return;
      }

      if (dragStartPos != dragEndPos) {
        let nextItem;
        let itemSibilings = panelMenuMainDiv.querySelectorAll("#tab-panels-menupopup-view > menuitem:not(.dragging)");
        itemSibilings.forEach((sibiling) => {
          sibiling.style.marginTop = "";
          if (sibiling.previousSibling === draggedItem) {
            nextItem = sibiling;
          }
        });
        if (nextItem == null) {
          //last position
          window.nativeTreeTabs.movePanel(panelId, null);
        } else {
          let beforePanelId = nextItem.getAttribute("panel-id");
          window.nativeTreeTabs.movePanel(panelId, beforePanelId);
        }
      }
      draggedItem = null;
    }
  }

  handleMouseUp = function(aEvent) {
    if (draggedItem) {
      if (helddown > 10) {
        aEvent.preventDefault();
        dragEnds();
      } else {
        dragEnds(clickOnly = true);
      }
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

  tabPanelGroup.addEventListener("wheel", (aEvent) => {
    //change selected panel on scroll
    let aDir = (aEvent.deltaY > 0) ? 1 : -1;
    let nextPanelId
    let nextPanelIndex;
    let startTabPanelIndex = nativeTreeTabs.tabPanels.indexOf(nativeTreeTabs.selectedtPanel);

    if (aDir == 1) {
      nextPanelIndex = (startTabPanelIndex === nativeTreeTabs.tabPanels.length - 1) ? 0 : startTabPanelIndex + 1;
    } else {
      nextPanelIndex = (startTabPanelIndex === 0) ? nativeTreeTabs.tabPanels.length - 1 : startTabPanelIndex - 1;
    }
    if (nextPanelIndex != startTabPanelIndex) {
      nativeTreeTabs.tabPanelShow(nativeTreeTabs.tabPanels[nextPanelIndex]);
    }
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
#NTT-header{
  max-width:100%;
  min-width: 0;
  display: flex;
}
#search-all-tabs-button image{
  display: inline-flex;
  width: 16px;
  height: 16px;
  padding-top:2px;
  -moz-context-properties: fill, fill-opacity;
  fill: currentColor;
  content:url("chrome://global/skin/icons/search-glass.svg");
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
  #NTT-header{
    flex-flow:column;
  }
}
:root:not([customizing])[uidensity="compact"] box:has(>sidebar-main):not([sidebar-launcher-expanded]) #NTT-header .button-background {
    margin-inline-start: 7px;
}
:root:not([customizing]) box:has(>sidebar-main):not([sidebar-launcher-expanded]) #NTT-header .button-background {
    margin-inline-start: 9px;
}
:root:not([customizing])[uidensity="touch"] box:has(>sidebar-main):not([sidebar-launcher-expanded]) #NTT-header .button-background {
    margin-inline-start: 12px;
}
#NTT-header .button-background:hover {
    background-color: var(--button-background-color);
}
#NTT-header .button-background {
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
@media (prefers-color-scheme: dark) {
    .tab-group-editor-swatches label {
        filter: saturate(1.2) brightness(0.6) contrast(1.4)!important;
    }
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
    --group-first-tab-top-margin:  ` + (1 + rootTabTopMargin * 0.7) + `px;
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

    tab:not(collapsed, [pinned], [tabPanel-hidden], tab-group tab)[tree-depth="0"] {
        padding-top: 6px!important;
    }
    tab-group:not(:has(tab[tabPanel-hidden="true"])) + tab:not(collapsed, [pinned], [tabPanel-hidden], tab-group tab)[tree-depth="0"]{
      padding-top: var(--root-tab-top-margin)!important;
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
#pinned-tabs-container[orient="vertical"] tab[tabPanel-hidden] *::before,
#pinned-tabs-container[orient="vertical"] tab[tabPanel-hidden],
#pinned-tabs-container[orient="vertical"] tab[tabPanel-hidden] * {
    display:none!important;
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
#tabbrowser-tabs[orient="vertical"] {

tab-group:has(tab[tabPanel-hidden="true"]) *,
tab-group:has(tab[tabPanel-hidden="true"])
{
  min-height:0!important;
  max-height:0!important;
  min-width:0!important;
  max-width:0!important;
  outline:none!important;
  padding:0!important;
  padding-inline:0!important;
  padding-block-end:0!important;
  padding-block-start:0!important;
  margin-block-start:0!important;
  margin-inline:0!important;
  margin:0!important;
  line-height:0!important;
  visibility: collapse !important;
}

tab-group tab{
  border-left: 2px solid var(--tab-group-line-color)!important;
}
.tab-group-line{
  display: none!important;
} 
.tab-group-label {
  max-width:100%!important;
  min-width:0!important;
  align-self: unset!important;
  margin-top: 0px!important;
  margin-inline-end:0px!important;
  text-align: left;
  border-radius: var(--tab-border-radius-forced)!important;
  text-indent: calc( var(--tab-icon-end-margin) + 20px)!important;
  background-image: url("chrome://global/skin/icons/folder.svg")!important;
  background-size: 18px;
  -moz-context-properties: fill, fill-opacity, stroke;
  fill: silver;
  background-repeat: no-repeat!important;
  background-position: left var(--tab-icon-end-margin) center!important;
  height: var(--tab-height)!important;
  font-size: var(--label-font-size)!important;
  line-height:calc( var(--tab-height) - 1px )!important;
}
tab-group[collapsed] .tab-group-label {
  margin-inline-end:0!important;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="context-fill"><path d="M1 3.5C1 2.67157 1.67157 2 2.5 2H6L8 4H13.5C14.3284 4 15 4.67157 15 5.5V12.5C15 13.3284 14.3284 14 13.5 14H2.5C1.67157 14 1 13.3284 1 12.5V3.5Z"/></svg>')!important;
}
tab-group[collapsed] .tab-group-label-container {
  margin-right:0!important;
}
.tab-group-label-container {
  margin-block-start: var( --root-tab-top-margin)!important;
  margin-right:0!important;
  margin-inline: var(--tab-inner-inline-margin)!important;
}
.tab-group-label-container {
    tab-group:not([collapsed])>&, tab-group[collapsed][hasactivetab]>& {
        padding-block-end: var(--group-first-tab-top-margin);
    }
}

@media (prefers-color-scheme: dark) {
    .tab-group-label {
        color: light-dark(var(--tab-group-color-pale), var(--tab-group-color-pale));
        background-color: color-mix( var(--tab-group-color), transparent 35%)!important;
        outline-color: color-mix( var(--tab-group-color) 70%, gold, transparent 10%)!important;
    }
    tab-group[collapsed] .tab-group-label {
        background-color: color-mix( var(--tab-group-color), transparent 40%)!important;
        outline-color: color-mix( var(--tab-group-color) 10%, silver 30%, transparent 10%)!important;
        filter: saturate(1) brightness(0.85) contrast(1)!important;
    }
}
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
#vertical-tabs tab[domain^="example.com"] { --tree-domain-color: rgba(60,55,60,0.8);--tree-domain-border-color: rgb(150,0,0); }
#vertical-tabs tab[domain^="youtube.com"] { --tree-domain-color: rgba(240,0,0,0.8);  --tree-domain-border-color: rgb(250,10,30);}
#vertical-tabs tab[domain^="reddit.com"] { --tree-domain-color: rgba(80,120,150,0.8); }
#vertical-tabs tab[domain$="github.com"] { --tree-domain-color: rgba(0,0,20,0.8); --tree-domain-border-color: darkblue;}
#vertical-tabs tab[domain$="ycombinator.com"] { --tree-domain-color: rgba(120,120,70,0.8); --tree-domain-border-color: yellow;}
#vertical-tabs tab[domain^="about"] { --tree-domain-color: rgba(120,10,120,0.8); }
#vertical-tabs tab[domain^="chrome"] { --tree-domain-color: rgba(120,170,170,0.9); }
#vertical-tabs tab[domain^="moz-extension"] { --tree-domain-color: rgba(60,55,60,0.8);--tree-domain-border-color: rgb(150,0,0); }

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
