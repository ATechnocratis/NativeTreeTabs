const isTab = element => gBrowser.isTab(element);
const moveChildren = true;

window.nativeTreeTabs = {

  _tabEvents: ["SSTabRestoring", "TabClose", "TabOpen", "TabMove", "TabSelect"],
  lastId: 0,
  originalRemoveTab: null,
  originalPinTab: null,
  originalAddTabSplitView: null,
  originalAddToMultiSelectedTabs: null,
  moveNewTabsDirectlyUnderParent: true,
  customStyle: null,

  init: function() {

    if (Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent") === false) {
      this.moveNewTabsDirectlyUnderParent = false;
    }
    Services.prefs.addObserver("browser.tabs.insertRelatedAfterCurrent", this);

    //add pref
    Services.prefs.setBoolPref("browser.tabs.selectOwnerOnClose", true);
    Services.prefs.setBoolPref("browser.tabs.dragDrop.createGroup.enabled", false);
    Services.prefs.setBoolPref("browser.tabs.groups.smart.enabled", false);

    //Check if Tabs existed before initialization
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
    //  make use of browser.tabs.selectOwnerOnClose
    // Wrapper is used because the selected tab changes
    //  before the closing tab is full closed
    this.originalRemoveTab = gBrowser.removeTab;
    gBrowser.removeTab = function(aTab, aOptions) {
      let previousTab = getPreviousTab(aTab);
      if (aTab.selected && previousTab) {
        let tabDepth = aTab.getAttribute("tree-depth");
        let nextTab = getNextTab(aTab);
        let rootNext = (nextTab && parseInt(nextTab.getAttribute("tree-depth")) >= parseInt(tabDepth) &&
            (parseInt(nextTab.getAttribute("tree-depth")) > parseInt(previousTab.getAttribute("tree-depth")))) ?
          false : true;
        if (tabDepth != "0" && rootNext) aTab.owner = getPreviousTab(aTab);
      }
      nativeTreeTabs.originalRemoveTab.apply(this, arguments);
    };

    //Tab pinning
    this.originalPinTab = gBrowser.pinTab;
    gBrowser.pinTab = function(aTab, aOptions) {
      removeTreeOutline(aTab._tPos, aTab);
      nativeTreeTabs.tabClose(aTab);
      if (aTab._tPos != 0) {
        aTab.setAttribute("skipMoveForced", true);
      }
      nativeTreeTabs.originalPinTab.apply(this, arguments);
    };

    //Split View creation
    this.originalAddTabSplitView = gBrowser.addTabSplitView;
    gBrowser.addTabSplitView = function(tabsToAdd, {
      insertBefore,
      trigger,
    }) {
      nativeTreeTabs.moveSplitView(tabsToAdd, insertBefore);
      nativeTreeTabs.originalAddTabSplitView.apply(this, arguments);
    };
    //Multiselect ignore hidden tabs
    this.originalAddToMultiSelectedTabs = gBrowser.addToMultiSelectedTabs;
    gBrowser.addToMultiSelectedTabs = function(aTab) {
      if (aTab.hasAttribute("hidden-child"))
        return;
      nativeTreeTabs.originalAddToMultiSelectedTabs.apply(this, arguments);
    };


    this.customStyle = loadNTTstyle();
    Services.prefs.addObserver("treeTabs.rootTabTopMargin", this);
    Services.prefs.addObserver("treeTabs.branchTabTopMargin", this);
    Services.prefs.addObserver("treeTabs.tabHeight", this);
    Services.prefs.addObserver("treeTabs.labelFontSize", this);

    //-------------------
    console.log("Native Tree Tabs loaded.");
  },

  uninit: function() {
    gBrowser.removeTabsProgressListener(this);
    this._tabEvents.forEach(function(aEvent) {
      gBrowser.tabContainer.removeEventListener(aEvent, this);
    }, this);
    gBrowser.removeTab = this.originalRemoveTab;
    gBrowser.pinTab = this.originalPinTab;
    gBrowser.addTabSplitView = this.originalAddTabSplitView;
    gBrowser.addToMultiSelectedTabs = this.originalAddToMultiSelectedTabs;
  },

  onLocationChange(browser, webProgress, request, locationURI, flags) {
    const aTab = gBrowser.getTabForBrowser(browser);
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
    }
  },

  moveSplitView: function(tabsToMove, insertionPoint) {
    tabsToMove.forEach(this.tabClose, this);
    if (tabsToMove[0].getAttribute("tree-depth") != 0 || tabsToMove[1].getAttribute("tree-depth") != 0) {
      tabsToMove.forEach(function(cTab) {
        if (cTab.getAttribute("tree-depth") != '0') {
          setTreeDepth(cTab, '0');
        }
        if (!cTab.hasAttribute("skipMoveForced")) {
          cTab.setAttribute("skipMoveForced", true);
        }
      }, this);
      gBrowser.moveTabsBefore(tabsToMove, getClosestZeroDepthTab(insertionPoint, "up"));
      tabsToMove.forEach(function(cTab) {
        cTab.removeAttribute("skipMoveForced");
      }, this);
    }
  },

  //Fix children depth and maybe move them together with parent
  updateChildrenFromIndex: function(aTab, prevPosition, newPosition, tabOriginalDepth) {
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
      depthFix = parseInt(tabOriginalDepth) - parseInt(aTab.getAttribute("tree-depth"));
    }

    while (nextTab) {
      //skip multiselected
      while (nextTab && nextTab.multiselected && (!multiSelectIllegalMove && nextTab != aTab)) {
        nextTabTreeDepth = nextTab.getAttribute("tree-depth");
        if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= tabOriginalDepth) {
          break;
        }
        nextTab = nextTab.nextSibling;
      }
      if (!isTab(nextTab)) break;
      nextTabTreeDepth = nextTab.getAttribute("tree-depth");
      if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= tabOriginalDepth ||
        (depthUpdate && !nextTab.hasAttribute("hidden-child") && !legalMove) ||
        (nextTab === aTab && legalMove)) {
        break;
      }
      if (depthUpdate) {
        tabsToMove.push(nextTab);
        nextTab.setAttribute("skipMoveForced", true);
      }
      let newDepth = parseInt(nextTabTreeDepth) - depthFix;
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
    let depthFix = parseInt(tabOriginalDepth) - parseInt(aTab.getAttribute("tree-depth"));

    while (nextTab) {
      while (nextTab && nextTab.multiselected) {
        nextTab = nextTab.nextSibling;
      }
      if (!isTab(nextTab))
        break;
      nextTabTreeDepth = nextTab.getAttribute("tree-depth");
      if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= tabOriginalDepth) {
        break;
      }
      let newDepth = parseInt(nextTabTreeDepth) - depthFix;
      setTreeDepth(nextTab, newDepth);
      nextTab = getNextTab(nextTab);
    }
  },

  multiselectedDepthUpdate: function(selectedTabs, newDepth, aTab) {
    newDepth = parseInt(newDepth);
    let selectedIds = new Map();
    selectedTabs.forEach(function(sTab) {
      selectedIds.set(sTab.getAttribute("tree-id"), sTab)
    }, this);
    selectedTabs.forEach(function(sTab) {
      let depthFix = newDepth;
      copyOpener(sTab, aTab);
      sTab.setAttribute("new-tree-depth", depthFix);
    }, this);
    selectedTabs.forEach(function(sTab) {
      let depthFix = sTab.getAttribute("new-tree-depth");
      let oldDepth = parseInt(sTab.getAttribute("tree-depth"));
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
        sTab.setAttribute("dragStartPos", sTab._tPos);
      }, this);
    } else {
      let aTab = aEvent.currentTarget;
      aTab.setAttribute("dragStartPos", aTab._tPos);
      if (aTab.getAttribute("tree-depth") != '0')
        aTab.setAttribute("dragStartoldParent", getRootTab(aTab).getAttribute("tree-id"));
      else
        aTab.setAttribute("dragStartoldParent", "");
      if (moveChildren)
        outlineTree(aTab, true);
    }
  },

  tabDragEnd: function(aEvent) {
    let aTab = aEvent.target;
    let selectedTabs = gBrowser.selectedTabs;
    if (selectedTabs.length > 1) {
      aTab = selectedTabs[0];
    }
    //....
    if (aTab.splitview) {
      return;
    }
    let previousTab = aTab.previousSibling;
    let nextTab = getNextTab(aTab);
    let oldDepth = aTab.getAttribute("tree-depth");
    while (previousTab && (previousTab.hasAttribute("hidden-child") || previousTab.multiselected)) {
      previousTab = previousTab.previousSibling;
    }
    while (nextTab && (nextTab.hasAttribute("hidden-child") || nextTab.multiselected)) {
      nextTab = getNextTab(nextTab);
    }
    let previousPosition = parseInt(aTab.getAttribute("dragStartPos"));
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
      while (isTab(nextTab) && nextTab.getAttribute("tree-depth") > oldDepth) {
        nextTab = getNextTab(nextTab);
      }
    }
    let newDepth = -1;
    let previousTabDepth = null;
    let nextTabDepth = null;
    let shouldUpdateChildren = false;

    if (isTab(previousTab)) previousTabDepth = parseInt(previousTab.getAttribute("tree-depth"));
    if (isTab(nextTab)) nextTabDepth = parseInt(nextTab.getAttribute("tree-depth"));

    //Case 0: Dropped inside a tab -> Set tab as parent
    if (previousTabDepth != null && offsetY < 4) {
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
          previousTab.setCustomTabValue(aTab, "twisted-root", 'true');
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
      // all will get the same depth
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
      this.updateChildrenLite(aTab, parseInt(oldDepth));
    }
  },

  //Adjust depth level according to previous and next
  // (up and down) tab levels
  // *if they exist
  tabMove: function(aTab, aEvent) {
    //Skip update
    if (aTab.hasAttribute("skipMoveForced") && !aTab.splitview) {
      aTab.removeAttribute("skipMoveForced");
      return;
    }
    let tabOriginalDepth = parseInt(aTab.getAttribute("tree-depth"));
    let prevPosition = aEvent.detail.previousTabState.tabIndex;
    let newPosition = aEvent.detail.currentTabState.tabIndex;

    //Used for drop under last position in tab strip
    // dragend will overwrite this if (case 0,1,2 happens)
    if (newPosition == gBrowser.tabs.length - 1) {
      setTreeDepth(aTab, '0');
      this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth);
      return;
    }

    let previousTab = aTab.previousSibling;
    let nextTab = aTab.nextSibling;
    let aTabTreeId = aTab.getAttribute("tree-id");

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
      if (trueNext && trueNext.hasAttribute("tree-depth") && parseInt(trueNext.getAttribute("tree-depth")) != 0) {
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
      let newPos = nextTab;
      while (nextTab && nextTab.hasAttribute("hidden-child") &&
        aTabTreeId != nextTab.getAttribute("hidden-child-rootID")) {
        newPos = nextTab;
        nextTab = getNextTab(nextTab);
      }
      aTab.setAttribute("skipMoveForced", true);
      gBrowser.moveTabAfter(aTab, newPos);
      aTab.removeAttribute("skipMoveForced");
      if (aTab._tPos == gBrowser.tabs.length - 1) {
        setTreeDepth(aTab, '0');
        this.updateChildrenFromIndex(aTab, prevPosition, aTab._tPos, tabOriginalDepth);
        return;
      }
    }

    //Ignore hidden tabs and tabs selected to move 
    while (previousTab && (previousTab.hasAttribute("hidden-child") || previousTab.multiselected)) {
      previousTab = previousTab.previousSibling;
    }
    while (nextTab && (nextTab.hasAttribute("hidden-child") || nextTab.multiselected)) {
      nextTab = nextTab.nextSibling;
    }

    let newDepth = aTab.getAttribute("tree-depth");
    let previousTabDepth;
    if (isTab(previousTab)) {
      previousTabDepth = parseInt(previousTab.getAttribute("tree-depth"));
      newDepth = previousTabDepth;
      let newOpener = previousTab;
      if (isTab(nextTab)) {
        let nextTabDepth = nextTab.getAttribute("tree-depth");
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
    let oldDepth = aTab.getAttribute("tree-depth");
    if (oldDepth != newDepth) {
      setTreeDepth(aTab, newDepth);
    }
    //Update children
    this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth);

    //If aTab became child of twisted tab then unravel it
    if (isTab(previousTab)) {
      previousTabDepth = parseInt(previousTab.getAttribute("tree-depth"));
      if (previousTab.hasAttribute("twisted-root") && previousTabDepth < newDepth) {
        this.toggleTwist(previousTab);
      }
    }
  },

  tabSelected: function(aTab) {
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
      let treeDepth = parseInt(aTab.getAttribute("tree-depth"));
      if (!isTab(nextTab) || !nextTab.hasAttribute("tree-depth") ||
        (parseInt(nextTab.getAttribute("tree-depth")) <= treeDepth)) return;
      let tabsToRemove = new Array();
      tabsToRemove.push(aTab);
      while (nextTab) {
        nextTabTreeDepth = nextTab.getAttribute("tree-depth");
        if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= treeDepth) {
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
    let treeDepth = parseInt(aTab.getAttribute("tree-depth"));
    //Only for tabs with children
    if (!isTab(nextTab) || !nextTab.hasAttribute("tree-depth") ||
      (parseInt(nextTab.getAttribute("tree-depth")) <= treeDepth))
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
      nextTabTreeDepth = nextTab.getAttribute("tree-depth");
      if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= treeDepth) {
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
        let treeDepthNested = parseInt(nextTab.getAttribute("tree-depth"));
        nextTab = getNextTab(nextTab);
        while (nextTab) {
          nextTabTreeDepthNested = nextTab.getAttribute("tree-depth");
          if (nextTabTreeDepthNested == null || parseInt(nextTabTreeDepthNested) <= treeDepthNested) {
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
    //temp tab leave it be
    if (!aTab.hasAttribute("tree-id")) {
      return;
    }
    let nextTab = getNextTab(aTab);
    let treeDepth = parseInt(aTab.getAttribute("tree-depth"));
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
        nextTabTreeDepth = nextTab.getAttribute("tree-depth");
        if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= treeDepth) {
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
      nextTabTreeDepth = nextTab.getAttribute("tree-depth");
      if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= treeDepth) {
        break;
      }
      let newDepth = parseInt(nextTabTreeDepth) - 1;
      setTreeDepth(nextTab, newDepth);
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
        restoredDepth = parseInt(previousTab.getAttribute("tree-depth")) + 1;
      }
      //Didn't found parent and need fix
      else if (getPreviousTab(aTab)) {
        let prvDepth = getPreviousTab(aTab).getAttribute("tree-depth");
        if (prvDepth && restoredDepth > parseInt(prvDepth) + 1) {
          restoredDepth = parseInt(prvDepth) + 1;
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
        let rootTreeDepth = parseInt(restoredDepth);
        //Find direct children (Depth difference == 1 )
        while (nextTab && nextTab.hasAttribute("opener-id") && nextTab.getAttribute("opener-id") === restoredTreeId) {
          let depthPreRestore = parseInt(nextTab.getAttribute("tree-depth"));
          setTreeDepth(nextTab, rootTreeDepth + 1);
          nextTab = getNextTab(nextTab);
          //Fix grandchildren
          while (nextTab) {
            nextTabTreeDepth = nextTab.getAttribute("tree-depth");
            if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= depthPreRestore) {
              break;
            }
            let newDepth = parseInt(nextTabTreeDepth) - depthPreRestore + rootTreeDepth + 1;
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
  },

  tabOpen: function(aTab) {
    this.initTreeDepth(aTab);
    this.observeTab(aTab, this);
  },

  initTab: function(aTab) {
    aTab.addEventListener("dragend", this);
    aTab.addEventListener("dragstart", this);
    aTab.querySelector(".tab-icon-stack").addEventListener("click", this);
    aTab.querySelector(".tab-close-button").addEventListener("click", this);
    setDomainAttr(aTab);
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
      if (aTab.openerTab != null && parseInt(treeDepth) != 0) {
        setOpener(aTab, aTab.openerTab);
      }
    }
  },

  initTreeDepth: function(aTab) {
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

    let treeDepth = 0;
    if (rootTab != null && !rootTab.pinned && !rootTab.splitview) {
      let parentDepth = rootTab.getAttribute("tree-depth");
      if (parentDepth != null) {
        treeDepth = parseInt(parentDepth) + 1;
        let newPos = getPositionUnderRoot(rootTab);
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
      let nextDepth = parseInt(nextTab.getAttribute("tree-depth"));
      let prvDepth = parseInt(previousTab.getAttribute("tree-depth"));
      if (prvDepth != null && treeDepth <= prvDepth && nextDepth != null && (prvDepth <= nextDepth && nextDepth != 0)) {
        treeDepth = nextDepth;
      }
    }
    aTab.setAttribute("tree-depth", treeDepth);
    if (rootTab != null && rootTab.hasAttribute("twisted-root")) {
      this.toggleTwist(rootTab);
    }
    return treeDepth;
  },

  observe: function(subject, topic, name) {
    if (topic == "nsPref:changed") {
      if (name === "browser.tabs.insertRelatedAfterCurrent") {
        nativeTreeTabs.moveNewTabsDirectlyUnderParent = Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent");
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
  let nextTab = aTab.nextSibling;
  while (nextTab && (nextTab.splitview || nextTab.splitViewId)) {
    if (!isTab(nextTab) && nextTab.tagName != "tab-split-view-wrapper") return null;
    nextTab = nextTab.nextSibling;
  }
  if (nextTab && nextTab.splitview) return null;
  if (!isTab(nextTab)) return null;
  return nextTab;
}

getPreviousTab = function(aTab) {
  let previousTab = aTab.previousSibling;
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

setOpener = function(aTab, openerTab) {
  if (openerTab == null) return;
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
  }
}

removeOpener = function(aTab) {
  aTab.openerTab = null;
  aTab.removeAttribute("opener-id");
  SessionStore.deleteCustomTabValue(aTab, "opener-id");
}

setDomainAttr = function(aTab) {
  if (!isTab(aTab)) return;
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
    followingTabTreeDepth = followingTab.getAttribute("tree-depth");
    if (followingTabTreeDepth == null || parseInt(followingTabTreeDepth) == 0) {
      return followingTab;
    }
    followingTab = getFollowingTab(followingTab);
  }
  return null;
}

getRootTab = function(aTab, prevPosition) {
  let aTabDepth = parseInt(aTab.getAttribute("tree-depth"));
  if (aTabDepth == 0) return null;
  let previousTab = aTab.previousSibling;
  while (isTab(previousTab)) {
    if (parseInt(previousTab.getAttribute("tree-depth")) < aTabDepth) {
      return previousTab;
    }
    previousTab = previousTab.previousSibling;
  }
  return null;
}

getLastInTree = function(aTab) {
  let aTabDepth = parseInt(aTab.getAttribute("tree-depth"));
  let nextTab = aTab.nextSibling;
  let toReturn = nextTab;
  while (isTab(nextTab)) {
    if (parseInt(nextTab.getAttribute("tree-depth")) > aTabDepth) {
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
  let treeDepth = parseInt(aTab.getAttribute("tree-depth"));
  let nextTab = getNextTab(aTab);
  while (nextTab) {
    nextTabTreeDepth = nextTab.getAttribute("tree-depth");
    if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= treeDepth) {
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
    nextTabTreeDepth = nextTab.getAttribute("tree-depth");
    if (rootTab != nextTab) {
      if (nextTabTreeDepth == null || parseInt(nextTabTreeDepth) <= rootlDepth) {
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

loadNTTstyle = function() {
  let rootTabTopMargin = "10";
  if (Services.prefs.getPrefType("treeTabs.rootTabTopMargin") != 32) {
    Services.prefs.setStringPref("treeTabs.rootTabTopMargin", rootTabTopMargin);
  } else {
    rootTabTopMargin = Services.prefs.getStringPref("treeTabs.rootTabTopMargin");
  }
  let branchTabTopMargin = "10";
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


  let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
    Ci.nsIStyleSheetService
  );
  let toolboxCSS = `
:root {
    --root-tab-top-margin: ` + rootTabTopMargin + `px;
    --branch-tab-top-margin:  ` + branchTabTopMargin + `px;
    --tab-height: ` + tabHeight + `px;
    --label-font-size: ` + labelFontSize + `px;
    --tab-close-button-padding-custom: 4px;
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
    margin-inline-start: calc( ( ( 3.7 * var(--tab-indent) * var(--tab-indent) * var(--tab-indent) + ( 30 * var(--tab-indent) * var(--tab-indent))) / ( 11 * var(--tab-indent) * var(--tab-indent) + ( 10 * var(--tab-indent)) + 100)) * 1%) !important;
}
@container (min-width: 260px) {
    #tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab {
        margin-inline-start: calc(var(--tab-indent) * 1px)!important;
    }
}
#vertical-tabs tab:not(collapsed, [pinned]) {
    margin-bottom: 0px!important;
    padding-block-start: 0px!important;
    padding-block-end: 0px!important;
}
#vertical-tabs tab:not(collapsed, [pinned], [hidden-child]) {
    margin-top: var(--branch-tab-top-margin)!important;
}
#tabbrowser-arrowscrollbox[orient="vertical"]>tab:not(collapsed, [pinned])[tree-depth="0"], #tabbrowser-arrowscrollbox[orient="vertical"]>tab-split-view-wrapper {
    margin-top: var(--root-tab-top-margin) !important;
    margin-bottom: 0px!important;
}
#tabbrowser-arrowscrollbox[orient="vertical"]>tab:not(collapsed, [pinned])[tree-depth="0"]:first-child {
    margin-top: 6px !important;
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
#tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root] .tab-icon-stack::before {
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


:root {
    --tree-tab-default-color: rgb(130, 120, 140);
    --tab-icon-start: 3px;
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
      border-radius: var(--tab-border-radius);
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
      border-radius: var(--tab-border-radius);
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
    `data:text/css;charset=UTF=8,${encodeURIComponent(toolboxCSS)}`
  );

  if (!styleSvc.sheetRegistered(styleURI, styleSvc.AUTHOR_SHEET)) {
    styleSvc.loadAndRegisterSheet(styleURI, styleSvc.AUTHOR_SHEET);
  }
  return styleURI;
}
