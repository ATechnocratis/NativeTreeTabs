// ==UserScript==
// @name           Native Tree Tabs
// @version        0.3.1.6
// ==/UserScript==
const isTab = element => gBrowser.isTab(element);
const moveChildren = true;
const MAX_STACK_SIZE = 30;
const CUSTOMIZE_URL = "chrome://browser/content/sidebar/sidebar-customize.html";

window.nativeTreeTabs = {
  _tabEvents: ["SSTabRestoring", "TabClose", "TabOpen", "TabMove", "TabSelect", "TabUnpinned", "TabGroupUngroup", "TabGroupCreateByUser"],
  _initialized: false,
  lastId: 0,
  tabsIds: new Map(),
  originalRemoveTab: null,
  originalRemoveTabs: null,
  originalPinTab: null,
  originalAddTabSplitView: null,
  originalUnsplitTabs: new Map(),
  originalReverseTabs: new Map(),
  originalUpdateContextMenu: null,
  originalAddToMultiSelectedTabs: null,
  originalAdvanceSelectedTab: null,
  original_findTabToBlurTo: null,
  originalCloseTabOrWindow: null,
  original_getTabsToTheEndFrom: null,
  original_getTabsToTheStartFrom: null,
  originalRemoveAllTabsBut: null,
  originalPreviewPanelActivate: null,
  originalPreviewPanelDeactivate: null,
  shortcuts: new Array(),
  customStyle: new Array(),
  domElements: new Array(),
  observedPrefs: new Map(),
  selectedtPanel: null,
  previousSelectedPanel: null,
  tabPanels: [],
  previousSelectedTab: new Array(),
  selectedTab: null,
  clickedActiveTab: null,
  contextTab: null,
  defaultPanelName: {
    value: "Default Panel"
  },
  switchOnClose: {
    value: "0,2,1,3,4,5,6,7,8"
  },
  moveNewTabsDirectlyUnderParent: {
    value: true
  },
  lockCtrlTabInPanel: {
    value: true
  },
  switchSelectedOnClick: {
    value: false
  },
  switchSelectedOnClickStayOnPanel: {
    value: true
  },
  hopOverUnloadedTabs: {
    value: false
  },
  hopOverCollapsedTabsIncludeRestoredTabs: {
    value: true
  },
  hopOverCollapsedTabs: {
    value: true
  },
  collapseTreesAutomatically: {
    value: false
  },
  collapseGroupsAutomatically: {
    value: false
  },
  changePanelOnScroll: {
    value: true,
    onEnable: switchPanelOnScroll,
    onDisable: switchPanelOnScroll,
  },
  autohideSidebar: {
    value: false,
    onEnable: smartSidebarResize,
    onDisable: smartSidebarResize,
  },
  autohideSidebarNormalModeAutoExpand: {
    value: false,
    onEnable: toggleSidebars,
    onDisable: toggleSidebars,
  },

  init: function() {

    //Finds the script version to display
    let version;
    try {
      if (typeof _uc !== 'undefined') {
        //Xiaoxiaoflood loader
        version = Object.values(_uc.scripts).find(x => x.name == "Native Tree Tabs").version;
      } else if (typeof UC_API !== 'undefined') {
        // MrOtherGuy/fx-autoconfig
        version = UC_API.Scripts.getScriptData().find(x => x.name == "Native Tree Tabs").version;
      } else if (typeof userChrome_js !== 'undefined') {
        //alice0775/userChrome.js not tested yet
        version = userChrome_js.Scripts.getScriptData().find(x => x.name == "Native Tree Tabs").version;
      }
      if (version != null) {
        setPref("treeTabs.version", version);
      }
    } catch (e) {
      console.error(e);
    }

    //Check if disabled
    let enabled = getPref("treeTabs.enabled");
    if (enabled == false) {
      //only load settings in sidebar customize => to re enable
      Services.prefs.addObserver("treeTabs.enabled", this);
      Services.obs.addObserver(modifyCustomizePage.observeDocs, "chrome-document-global-created", false);
      return;
    } else {
      setPref("treeTabs.enabled", true)
    }
    Services.prefs.addObserver("treeTabs.enabled", this);

    this.addDefaultPanel();

    //initialize Tab Panels 
    let [tabpanelsElements, NTTstyle] = addNTTSidebarHeader();
    this.domElements.push(...tabpanelsElements);
    this.customStyle.push(NTTstyle);

    let nestTabElements = addNestTabsInTabContextMenu();
    this.domElements.push(...nestTabElements);

    this.initPreferences();

    //Check if tabs existed before initialization
    gBrowser.tabs.forEach(this.attachTabListeners, this);
    gBrowser.tabs.forEach(this.initTab, this);

    //Add listeners
    //Tab events
    this._tabEvents.forEach(function(aEvent) {
      gBrowser.tabContainer.addEventListener(aEvent, this);
    }, this);
    //Used for onlocation change to set tab domain attribute
    gBrowser.addTabsProgressListener(this);

    //-----Wrap some default functions-----
    // Useful when no event is omitted
    // or something needs to be executed
    // before the default function executes
    this.defaultFunctionWrap();

    //Used to find if the clicked tab is actually the selected tab or the too be selected 
    gBrowser.tabContainer.addEventListener("mousedown", this, true);

    this.addTabGroupCreateListeners();
    this.customStyle.push(loadNTTstyle());

    //add keyboard shortcuts
    this.addKeyboardShortcuts();
    window.addEventListener("keydown", this, true);
    //update selected tabs

    this.selectedTab = gBrowser.selectedTab;
    this.selectedtPanel.selectedTab = gBrowser.selectedTab;

    //observe sidebar settings document open
    modifyCustomizePage.start();

    //-------------------
    console.log("Native Tree Tabs loaded.");
    this._initialized = true;
  },

  uninit: function() {
    //Remove listeners and observers
    gBrowser.removeTabsProgressListener(this);
    this._tabEvents.forEach(function(aEvent) {
      gBrowser.tabContainer.removeEventListener(aEvent, this);
    }, this);
    for (const topic of this.observedPrefs.keys()) {
      Services.prefs.removeObserver(topic, this);
    };

    this.removeTabListeners();

    window.removeEventListener("keydown", this, true);

    Object.values(this).filter(key => key != null && key.hasOwnProperty("onEnable")).forEach(function(property) {
      if (property.value === true) {
        property.onDisable.call(this, false);
      }
    });

    //Restore default functions
    gBrowser.tabContainer.removeEventListener("mousedown", this);
    gBrowser.removeTab = this.originalRemoveTab;
    gBrowser.removeTabs = this.originalRemoveTabs;
    gBrowser.pinTab = this.originalPinTab;
    gBrowser.addTabSplitView = this.originalAddTabSplitView;
    TabContextMenu.updateContextMenu = this.originalUpdateContextMenu;
    gBrowser.addToMultiSelectedTabs = this.originalAddToMultiSelectedTabs;
    gBrowser.tabContainer.advanceSelectedTab = this.originalAdvanceSelectedTab;
    gBrowser._findTabToBlurTo = this.original_findTabToBlurTo;
    BrowserCommands.closeTabOrWindow = this.originalCloseTabOrWindow;
    gBrowser.original_getTabsToTheEndFrom = this.original_getTabsToTheEndFrom;
    gBrowser.original_getTabsToTheStartFrom = this.original_getTabsToTheStartFrom;
    gBrowser.originalRemoveAllTabsBut = this.originalRemoveAllTabsBut;
    gBrowser.tabContainer.previewPanel.activate = this.originalPreviewPanelActivate;
    gBrowser.tabContainer.previewPanel.deactivate = this.originalPreviewPanelDeactivate;

    window.gBrowser.splitViews.forEach(function(splitview) {
      let originalReverseTabs = this.originalReverseTabs.get(splitview.splitViewId);
      let originalUnsplitTabs = this.originalUnsplitTabs.get(splitview.splitViewId);
      if (originalUnsplitTabs != null) {
        splitview.unsplitTabs = originalUnsplitTabs;
      }
      if (originalReverseTabs != null) {
        splitview.reverseTabs = originalReverseTabs;
      }
    }, this);
    this.originalReverseTabs.clear();
    this.originalUnsplitTabs.clear();

    //Remove styles
    let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
    this.customStyle.forEach(function(style) {
      styleSvc.unregisterSheet(style[0], style[1]);
    });
    //Remove custom elements
    this.domElements.forEach(function(element) {
      if (element) {
        element.remove();
      }
    });

    this.tabPanels = new Array();
    gBrowser.tabs.forEach(function(aTab) {
      aTab.removeAttribute("tree-id");
      aTab.removeAttribute("tree-depth");
      aTab.removeAttribute("panel-id");
      aTab.removeAttribute("tabPanel-hidden");
      aTab.removeAttribute("twisted-root");
      aTab.removeAttribute("hidden-child");
      aTab.removeAttribute("hidden-child-rootID");
      let tCC = aTab.querySelector(".tab-child-count");
      if (tCC != null) tCC.remove()
      let tCC2 = aTab.querySelector(".tab-child-count2");
      if (tCC2 != null) tCC2.remove()

    }, this);

    modifyCustomizePage.unload();

    this._initialized = false;

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
      case "TabGroupUngroup":
        {
          this.tabGroupUngroup(aEvent);
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
          if (aEvent.button == 0 && aEvent.currentTarget.className === "tab-icon-stack") {
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
          break;
        }
      case "keydown":
        {
          this.keyboardListener(aEvent);
          break;
        }
    }
  },

  addKeyboardShortcuts: function() {
    //add keyboard shortcut for selected tab(s) moving/indention change
    //tab panel creation, tab panel cycle
    let createPanel = {
      action: nativeTreeTabs.tabPanelOpen,
      arguments: null,
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.createPanel", createPanel, "Ctrl + Alt + ,");
    this.shortcuts.push(createPanel);

    let switchPanel = {
      action: nativeTreeTabs.cycleTabPanels,
      arguments: 1,
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.cycleTabPanels", switchPanel, "Ctrl + ,");
    this.shortcuts.push(switchPanel);

    let switchPanelReverse = {
      action: nativeTreeTabs.cycleTabPanels,
      arguments: -1,
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.cycleTabPanelsReverse", switchPanelReverse, "Ctrl + Shift + ,");
    this.shortcuts.push(switchPanelReverse);

    let indentTab = {
      action: nativeTreeTabs.indentTab,
      arguments: "in",
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.indentTab", indentTab, "Ctrl + Alt + ArrowRight");
    this.shortcuts.push(indentTab);

    let indentTabOut = {
      action: nativeTreeTabs.indentTab,
      arguments: "out",
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.indentTabOut", indentTabOut, "Ctrl + Alt +ArrowLeft");
    this.shortcuts.push(indentTabOut);

    let moveTabUp = {
      action: nativeTreeTabs.moveTab,
      arguments: "up",
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.moveTabUp", moveTabUp, "Ctrl + Alt + ArrowUp");
    this.shortcuts.push(moveTabUp);

    let moveTabDown = {
      action: nativeTreeTabs.moveTab,
      arguments: "down",
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.moveTabDown", moveTabDown, "Ctrl + Alt + ArrowDown");
    this.shortcuts.push(moveTabDown);

    let flipActive = {
      action: nativeTreeTabs.flipActive,
      arguments: null,
      value: null,
      keys: null
    };
    this.observeTopic("treeTabs.shortcuts.flipActive", flipActive, "Ctrl + Shift + F");
    this.shortcuts.push(flipActive);
  },

  keyboardListener: function(e) {

    const modsAndKey = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
      key: e.keyCode
    };

    for (const shortcut of this.shortcuts) {
      if (modsAndKey.key != null && shortcut.keys.key != null &&
        shortcut.keys.key === modsAndKey.key &&
        shortcut.keys.ctrl === modsAndKey.ctrl &&
        shortcut.keys.alt === modsAndKey.alt &&
        shortcut.keys.shift === modsAndKey.shift &&
        shortcut.keys.meta === modsAndKey.meta) {
        e.preventDefault();
        e.stopImmediatePropagation();
        shortcut.action.call(this, shortcut.arguments);
        break;
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
          skipNextMoveCheck(cTab);
        }
      }, this);
      nativeTreeTabs.moveTabsBefore(tabsToMove, getClosestZeroDepthTab(insertionPoint, "up"));
      tabsToMove.forEach(function(cTab) {
        removeSkipNextMoveCheck(cTab);
      }, this);
    }
  },

  //Fix children depth and maybe move them together with parent
  updateChildrenFromIndex: function(aTab, prevPosition, newPosition, tabOriginalDepth, groupState = false, forceMultiselected = false, splitViewCreation = false) {
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
    if (aTab.splitViewId != null) {
      aTab = aTab.tabs[0];
    }
    if (aTab.splitview && !splitViewCreation && (prevPosition >= newPosition)) {
      nextTab = gBrowser.tabs[possibleChildIndex + 1];
    }
    let multiSelectedCheck = multiSelected(aTab) && !forceMultiselected;

    //Check if parent tab moved inside its own nested tree
    // if so skip moving the children and fix their depth
    let legalMove = (prevPosition < newPosition) ?
      checkInsideMove(aTab, nextTab, tabOriginalDepth) : true;

    let multiSelectIllegalMove = (!legalMove && multiSelectedCheck) ? true : false;

    // Move children if it was not an inside tree move and pref moveChildren is true
    legalMove = (legalMove && moveChildren) && (!multiSelectedCheck || aTab.hasAttribute("twisted-root"));

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
      while (nextTab && multiSelected(nextTab) && !forceMultiselected && (!multiSelectIllegalMove && nextTab != aTab)) {
        nextTabTreeDepth = getTreeDepth(nextTab);
        if (nextTabTreeDepth == null || nextTabTreeDepth <= tabOriginalDepth) {
          break;
        }
        nextTab = getNextTab(nextTab);
      }

      if (isIngroup) {
        //don't move collapsed tree children away in group creation
        while (isTab(nextTab) && nextTab.hasAttribute("hidden-child") && nextTab.getAttribute("hidden-child-rootID") != aTabTreeId) {
          let twistedRootId = nextTab.getAttribute("hidden-child-rootID");
          let nextTrueParent = seenIds.get(twistedRootId);
          if (nextTrueParent == null) {
            nextTrueParent = this.tabsIds.get(twistedRootId);
            if (nextTrueParent == null) {
              nextTrueParent = gBrowser.tabs.find(x => x.getAttribute("tree-id") === twistedRootId);
            }
            seenIds.set(twistedRootId, nextTrueParent);
          }
          nextTabTreeDepth = getTreeDepth(nextTab);
          if (nextTabTreeDepth == null || nextTabTreeDepth <= tabOriginalDepth || !multiSelected(nextTrueParent)) {
            break;
          }
          nextTab = getNextTab(nextTab);
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
        if (nextTab.splitview) {
          if (!tabsToMove.includes(nextTab.splitview))
            tabsToMove.push(nextTab.splitview);
        } else {
          tabsToMove.push(nextTab);
        }
        skipNextMoveCheck(nextTab);
      }
      let newDepth = parseInt(nextTabTreeDepth, 10) - depthFix;
      setTreeDepth(nextTab, newDepth);
      nextTab = getNextTab(nextTab);
    }
    if (tabsToMove.length > 0) {
      if (aTab.splitview && splitViewCreation) {
        let position = getLastInTree(aTab);
        gBrowser.moveTabsAfter(tabsToMove, position, {
          metricsContext: gBrowser.TabMetrics.userTriggeredContext(
            gBrowser.TabMetrics.METRIC_SOURCE.DRAG_AND_DROP
          )
        });
      } else {
        gBrowser.moveTabsAfter(tabsToMove, aTab, {
          metricsContext: gBrowser.TabMetrics.userTriggeredContext(
            gBrowser.TabMetrics.METRIC_SOURCE.DRAG_AND_DROP
          )
        });
      }
      tabsToMove.forEach(function(cTab) {
        removeSkipNextMoveCheck(cTab);
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
        while (nextTab && multiSelected(nextTab)) {
          nextTab = getNextTab(nextTab);
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
      if (sTab.splitview) {
        let sibling = sTab.splitview.tabs.find(t => t != sTab);
        if (!selectedTabs.includes(sibling)) {
          selectedIds.set(sibling.getAttribute("tree-id"), sibling)
        }
      }
      selectedIds.set(sTab.getAttribute("tree-id"), sTab)
    }, this);
    selectedTabs.forEach(function(sTab) {
      if (sTab.splitview) {
        sTab = sTab.splitview;
      }
      let depthFix;
      let oldAncestorId = sTab.getAttribute("multiSelectedAncestor");
      if (oldAncestorId) {
        let newParent = selectedIds.get(oldAncestorId);
        setOpener(sTab, newParent);
        if (newParent.splitview) {
          newParent = newParent.splitview;
        }
        depthFix = parseInt(newParent.getAttribute("new-tree-depth"), 10) + 1;
        sTab.setAttribute("multiSelectedAncestorFixed", true);
        sTab.removeAttribute("multiSelectedAncestor");
      } else {
        depthFix = newDepth;
        copyOpener(sTab, aTab);
      }
      sTab.setAttribute("new-tree-depth", depthFix);
    }, this);
    selectedTabs.forEach(function(sTab) {
      if (sTab.splitview) {
        sTab = sTab.splitview;
      }
      let depthFix = sTab.getAttribute("new-tree-depth");
      if (depthFix != null) {
        let oldDepth = getTreeDepth(sTab);
        setTreeDepth(sTab, depthFix);
        if (depthFix == 0)
          removeOpener(sTab);
        sTab.removeAttribute("new-tree-depth");
        sTab.removeAttribute("dragStartPos");
        this.updateChildrenLite(sTab, oldDepth);
      }
    }, this);
  },

  tabDragStart: function(aEvent) {

    let aTab = aEvent.currentTarget;

    if (aTab.pinned) {
      return;
    }

    if (aTab.splitview) {
      aTab.splitview.addEventListener("dragend", this);
    }

    let selectedTabs = gBrowser.selectedTabs;
    if (selectedTabs.length > 1) {
      selectedTabs.forEach(function(sTab) {
        setCustomTabValue(sTab, "draggedFromWindow", window.docShell.outerWindowID.toString());
        sTab.removeAttribute("multiSelectedAncestorFixed");
        sTab.removeAttribute("multiSelectedAncestor");
        if (sTab.splitview) {
          sTab.splitview.setAttribute("dragStartPos", getPosition(sTab));
        } else
          sTab.setAttribute("dragStartPos", getPosition(sTab));
        if (getTreeDepth(sTab) != 0) {
          let rootTab = getRootTab(sTab);
          while (isTab(rootTab) && !multiSelected(rootTab)) {
            rootTab = getRootTab(rootTab);
          }
          if (rootTab != null) {
            if (sTab.splitview) {
              sTab.splitview.setAttribute("multiSelectedAncestor", rootTab.getAttribute("tree-id"));
            } else
              sTab.setAttribute("multiSelectedAncestor", rootTab.getAttribute("tree-id"));
          }
        }
      }, this);
    } else {
      setCustomTabValue(aTab, "draggedFromWindow", window.docShell.outerWindowID.toString());

      if (aTab.splitview) {
        aTab.splitview.setAttribute("dragStartPos", getPosition(aTab));
      } else
        aTab.setAttribute("dragStartPos", getPosition(aTab));

      if (aTab.hasAttribute("nestTab")) {
        if (!aTab.hasAttribute("twisted-root")) {
          aTab.setAttribute("untwist", "true");
        }
        this.toggleTwist(aTab, forced = true);
      }

      if (getTreeDepth(aTab) != 0) {
        let rootTab = getRootTab(aTab);
        //should not fail if everything worked normal
        if (rootTab) {
          if (aTab.splitview) {
            aTab.splitview.setAttribute("dragStartoldParent", rootTab.getAttribute("tree-id"));
          } else
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
      deleteCustomTabValue(aTab, "draggedFromWindow");
    }, 1000);

    let selectedTabs = gBrowser.selectedTabs;
    if (selectedTabs.length > 1) {
      selectedTabs.forEach(function(sTab) {
        setTimeout(() => {
          deleteCustomTabValue(sTab, "draggedFromWindow");
        }, 1000);
      });
      aTab = selectedTabs[0];
    }
    //....
    // if (aTab.splitview) {
    //   aTab = aTab.splitview;
    //   temp0.tabs[0]
    // }
    if (aTab.splitview) {
      aTab = aTab.splitview;
    }

    let previousTab = aTab.previousSibling;
    if (previousTab && previousTab.splitViewId) {
      previousTab = previousTab.tabs[0];
    }

    let nextTab = getNextTab(aTab);

    // if (aTab.splitViewId) {
    //   aTab = aTab.tabs[0];
    // }
    let oldDepth = getTreeDepth(aTab);
    while (previousTab && (isHidden(previousTab) || multiSelected(previousTab))) {
      previousTab = getPreviousTab(previousTab);
    }
    while (nextTab && (isHidden(nextTab) || multiSelected(nextTab))) {
      nextTab = getNextTab(nextTab);
    }
    if (previousTab) {
      let rectPrv = previousTab.getBoundingClientRect().top;
      //Stop case where wrong previousTab is set
      // previous is actually under
      // Internal (drag-and-drop) bug?
      if (rectPrv > rect || previousTab.pinned) {
        previousTab = null;
      }
      //make sure drag to pin area doesn't change tree depth too
    }

    let previousPosition = parseInt(aTab.getAttribute("dragStartPos"), 10);
    let oldParent = aTab.getAttribute("dragStartoldParent");
    aTab.removeAttribute("dragStartoldParent");
    let currentPosition = getPosition(aTab);
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

    if (aTab.pinned) {
      return;
    }

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
    if (aTab.splitViewId) {
      let rootTabTopMargin = getPref("treeTabs.rootTabTopMargin");
      if (rootTabTopMargin != null) {
        offsetY = parseInt(rootTabTopMargin, 10) + offsetY;
      }
    }
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

    let tabHeight = (Services.prefs.getPrefType("treeTabs.tabHeight") != 32) ? 30 :
      Services.prefs.getStringPref("treeTabs.tabHeight");

    let calcDistance = tabHeight / 1.4 - 8;

    if (calcDistance < -4) {
      calcDistance = -4;
    }

    if (previousTabDepth != null && offsetY < calcDistance) {
      //Tab was already direct parent -> Swap
      let isAlreadyParent = (!multiSelected(aTab) && oldParent != "" &&
          oldParent === previousTab.getAttribute("tree-id")) && !previousTab.hasAttribute("nestTab") ?
        true : false;
      if (isAlreadyParent) {
        if (aTab.splitViewId == null) {
          skipNextMoveCheck(aTab);
          gBrowser.moveTabAfter(aTab, previousTab);
          removeSkipNextMoveCheck(aTab);
          skipNextMoveCheck(previousTab);
          gBrowser.moveTabTo(previousTab, {
            tabIndex: currentPosition
          });
          removeSkipNextMoveCheck(previousTab);
          setTreeDepth(previousTab, oldDepth);
          setTreeDepth(aTab, previousTabDepth);
          if (aTab.hasAttribute("twisted-root")) {
            aTab.removeAttribute("twisted-root");
            deleteCustomTabValue(aTab, "twisted-root");
            previousTab.setAttribute("twisted-root", true);
            setCustomTabValue(previousTab, "twisted-root", 'true');
          }
          //dirty swap
          let oldTreeId = aTab.getAttribute("tree-id");
          setTabTreeID(aTab, previousTab.getAttribute("tree-id"));
          setTabTreeID(previousTab, oldTreeId);
          copyOpener(aTab, previousTab);
          setOpener(previousTab, aTab);
          return;
        }
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

    if (aTab.hasAttribute("nestTab") && aTab.hasAttribute("untwist")) {
      aTab.removeAttribute("untwist");
      // setTimeout(() => {
      //   if(aTab.hasAttribute("twisted-root")){
      //     this.toggleTwist(aTab);
      //   }
      // }, 100);
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

  tabGroupUngroup: function(aEvent) {
    let tabs = aEvent.target.tabs;
    tabs.forEach(function(sTab) {
      skipNextMoveCheck(sTab);
    });
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
        if (multiSelected(nextChild)) {
          nextChild.setAttribute("skipGroupDepthUpdate", "true");
        }
        nextChild = getNextTab(nextChild);
        if (nextChild === aTab) {
          nextChild = getNextTab(nextChild);
        }
      }
    }, this);
    aTab.removeAttribute("groupCreationSkip");
    aTab.removeAttribute("skipGroupDepthUpdate");
  },

  checkForPanelOverStep: function(aTab, prevPosition, tabOriginalDepth, group) {
    let aTabPanelId = (aTab.splitViewId != null) ? aTab.tabs[0].getAttribute("panel-id") : aTab.getAttribute("panel-id");
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
            skipNextMoveCheck(mTab)
          }, this);
          nativeTreeTabs.moveTabBefore(tabToMoves, nextInPanel);
          tabToMoves.tabs.forEach(function(mTab) {
            removeSkipNextMoveCheck(mTab);
          }, this);
        } else {
          skipNextMoveCheck(aTab);
          nativeTreeTabs.moveTabBefore(aTab, nextInPanel);
          setTreeDepth(aTab, 0);
          removeSkipNextMoveCheck(aTab);
          this.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), tabOriginalDepth);
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
            skipNextMoveCheck(mTab);
          }, this);
          nativeTreeTabs.moveTabAfter(tabToMoves, previousnPanel);
          tabToMoves.tabs.forEach(function(mTab) {
            removeSkipNextMoveCheck(mTab);

          }, this);
        } else {
          skipNextMoveCheck(aTab);
          nativeTreeTabs.moveTabAfter(aTab, previousnPanel);
          removeSkipNextMoveCheck(aTab);
          this.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), tabOriginalDepth);
        }
        return true;
      }
    }
    return false;
  },

  recTraverseTree: function(aTab, aTabDepth, currentRootDepth) {
    let nextTab = getNextTab(aTab);
    while (isTab(nextTab)) {
      nextDepth = getTreeDepth(nextTab);
      if (nextDepth == null || nextDepth < aTabDepth) {
        return nextTab;
      } else if (nextDepth === aTabDepth) {
        copyOpener(nextTab, aTab);
        setTreeDepth(nextTab, currentRootDepth);
        nextTab = getNextTab(nextTab);
      } else {
        setOpener(nextTab, getPreviousTab(nextTab));
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
      if (previousTab && previousTab.splitViewId) {
        previousTab = previousTab.tabs[1];
      }
      if (isTab(previousTab) && !previousTab.hasAttribute("tabPanel-hidden") && previousTab.group != aTab.group) {
        let nextTab = aTab.group.nextSibling;
        if (nextTab && nextTab.splitViewId != null) {
          nextTab = nextTab.tabs[0];
        }
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
    if ((aTab.hasAttribute("skipMoveForced")) || aTab.pinned) {
      removeSkipNextMoveCheck(aTab);
      return;
    }

    if (aTab.splitview) {
      if (aTab.splitview.tabs[1] == aTab)
        return;
      aTab = aTab.splitview;
    }

    let telemetrySource = (aEvent.detail.metricsContext) ? aEvent.detail.metricsContext.telemetrySource : aEvent.detail.telemetrySource;
    let forceMultiselected = false;
    //Multiple selected case
    if (multiSelected(aTab)) {
      if (aEvent.detail.previousTabState.tabGroupId && !aEvent.detail.currentTabState.tabGroupId && multiSelected(aTab) &&
        telemetrySource != "drag") {
        forceMultiselected = true;
      }

      if (aTab.hasAttribute("multiSelectedAncestorFixed")) {
        aTab.removeAttribute("multiSelectedAncestorFixed");
        return;
      }
      if (aTab.hasAttribute("multiSelectedAncestor")) {
        let ancestorId = aTab.getAttribute("multiSelectedAncestor").toString();
        // aTab.removeAttribute("multiSelectedAncestor");
        let ancestorArray = gBrowser.selectedTabs.slice();
        ancestorArray.forEach(function(sTab) {
          if (sTab.splitview) {
            let sibling = sTab.splitview.tabs.find(t => t != sTab);
            if (!ancestorArray.includes(sibling)) {
              ancestorArray.push(sibling);
            }
          }
        }, this);
        let ancestor = ancestorArray.find(x => x.getAttribute("tree-id").toString() === ancestorId);
        setOpener(aTab, ancestor);
        let depthFix = getTreeDepth(ancestor) + 1;
        setTreeDepth(aTab, depthFix);
        return;
      }
    }

    let tabOriginalDepth = getTreeDepth(aTab);

    //Multiselected group creation keep tree structure
    if (!aEvent.detail.previousTabState.tabGroupId && aEvent.detail.currentTabState.tabGroupId &&
      telemetrySource != "drag" && multiSelected(aTab)) {
      if (!aTab.hasAttribute("groupCreationSkip")) {
        //First tab seen, prepare the others
        this.newGroupCreation(aTab, prevPosition, newPosition);
        //Remove so it can update child depth in updateChildrenFromIndex
        gBrowser.removeFromMultiSelectedTabs(aTab);
        setTreeDepth(aTab, 0);
        this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, true, forceMultiselected = true);
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
          this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, true, forceMultiselected = true);
          return;
        }
      }
    }

    let inGroup = (aTab.group && aEvent.detail.previousTabState.tabGroupId === aEvent.detail.currentTabState.tabGroupId) ? true : false;
    let previousTab = getPreviousTab(aTab);
    let nextTab = (aTab.splitview) ? getNextTab(aTab.splitview) : getNextTab(aTab);
    let aTabTreeId = (aTab.splitViewId != null) ? aTab.tabs[0].getAttribute("tree-id") : aTab.getAttribute("tree-id");

    //illegal move
    // twisted root tab moved under its own hidden tree
    if (aTab.hasAttribute("twisted-root")) {
      if (isTab(previousTab) && previousTab.hasAttribute("hidden-child") &&
        previousTab.getAttribute("hidden-child-rootID") === aTabTreeId) {
        skipNextMoveCheck(aTab);
        gBrowser.moveTabBefore(aTab, gBrowser.tabs[prevPosition]);
        removeSkipNextMoveCheck(aTab);
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
      skipNextMoveCheck(aTab);
      gBrowser.moveTabAfter(aTab, newPosition);
      removeSkipNextMoveCheck(aTab);
      if (getPosition(aTab) == gBrowser.tabs.length - 1) {
        setTreeDepth(aTab, '0');
        this.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), tabOriginalDepth, false, forceMultiselected);
        return;
      }
    }

    //illegal 3 (move on other tab panel)
    if (this.checkForPanelOverStep(aTab, prevPosition, tabOriginalDepth, false)) {
      return;
    }

    //Split view moved
    if (aTab.splitview && false) {
      if (getTreeDepth(aTab) != 0) {
        setTreeDepth(aTab, '0');
      }
      let trueNext = getNextTab(aTab.splitview);
      aTab.splitview.tabs.forEach(function(cTab) {
        if (getTreeDepth(cTab) != 0) {
          setTreeDepth(cTab, '0');
        }
        //This is to make sure that when the split
        //breaks the tabs stay at 0 depth 
        if (!cTab.hasAttribute("skipMoveForced")) {
          skipNextMoveCheck(cTab);
        }
      }, this);
      if (trueNext && hasTreeDepth(trueNext) && getTreeDepth(trueNext) != 0) {
        let direction = 'up';
        if (newPosition > prevPosition) direction = 'down';
        let closestZero = getClosestZeroDepthTab(trueNext, direction);
        if (closestZero == null) {
          closestZero = gBrowser.tabs[gBrowser.tabs.length - 1];
          nativeTreeTabs.moveTabAfter(aTab.splitview, closestZero);
        } else
          nativeTreeTabs.moveTabBefore(aTab.splitview, closestZero);
      }
      return;
    }

    //Used for drop under last position in tab strip
    // dragend will overwrite this if (case 0,1,2 happens)
    if (newPosition == gBrowser.tabs.length - 1 || (isTab(nextTab) && nextTab.hasAttribute("tabPanel-hidden"))) {
      setTreeDepth(aTab, '0');
      this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, false, forceMultiselected);
      return;
    }

    //Ignore hidden tabs and tabs selected to move 
    while (previousTab && (previousTab.hasAttribute("hidden-child") || multiSelected(previousTab))) {
      previousTab = getPreviousTab(previousTab);
    }
    while (nextTab && (nextTab.hasAttribute("hidden-child") || multiSelected(nextTab))) {
      nextTab = getNextTab(nextTab);
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
    this.updateChildrenFromIndex(aTab, prevPosition, newPosition, tabOriginalDepth, false, forceMultiselected);

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
    if (aTab.hasAttribute("nestTab")) {
      //make nest tabs unselectable 
      function protectSelection() {
        if (gBrowser.selectedTab && gBrowser.selectedTab.hasAttribute("nestTab")) {
          if (nativeTreeTabs.selectedTab.hasAttribute("hidden-child") && nativeTreeTabs.selectedTab.getAttribute("hidden-child-rootID") == aTab.getAttribute("tree-id")) {
            gBrowser.selectedTab.setAttribute("skipUntwist", "");
          }
          let pSTab = nativeTreeTabs.selectedTab;
          if (window.gBrowser.tabs.includes(pSTab) && pSTab.closing == false) {
            gBrowser.selectedTab = pSTab;
          }
        }
      }
      originalSelectedTab = gBrowser.selectedTab;
      protectSelection();
      const revertInterval = setInterval(protectSelection, 10);

      let released = false;
      const onMouseUp = () => {
        if (released) {
          return;
        }
        released = true;
        document.removeEventListener("mouseup", onMouseUp, {
          once: true
        });
        clearInterval(revertInterval);
      };
      document.addEventListener("mouseup", onMouseUp, {
        once: true
      });
      return;
    } else {
      if (aEvent.target.closest(".tab-icon-stack") && SidebarController._sidebarMain.expanded) {
        //Makes favicon/twisty click to not select tab
        // (if not ancestor)
        let nextTab = getNextTab(aTab);
        if (aTab.splitview) {
          if (aTab.splitview.firstChild != aTab)
            return;
          nextTab = getNextTab(aTab.splitview);
        }
        if (nextTab && getTreeDepth(nextTab) > getTreeDepth(aTab) && !checkIfIsAncestor(gBrowser.selectedTab, aTab)) {
          // aEvent.preventDefault();
          aEvent.stopPropagation();
          return;
        }
      }
      this.clickedActiveTab = aTab && aTab.selected ? aTab : null;
    }
  },

  flipActive: function(aTab = null) {
    if (aTab == null) {
      aTab = window.gBrowser.selectedTab;
      nativeTreeTabs.clickedActiveTab = aTab;
    }
    let source = (nativeTreeTabs.switchSelectedOnClickStayOnPanel.value) ? nativeTreeTabs.selectedtPanel.previousSelectedTab : nativeTreeTabs.previousSelectedTab;

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

  previousSwitch: function(aEvent) {

    if (nativeTreeTabs.switchSelectedOnClick.value === false) {
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
    if (aTab != null)
      nativeTreeTabs.flipActive(aTab);
  },

  tabUnpinned: function(aTab, aEvent) {
    //Tab will be move to top
    // panel position might mismatch
    let nextTab = getNextTab(aTab);
    let aTabPanelId = aTab.getAttribute("panel-id");
    if (nextTab && !aTab.pinned && nextTab.getAttribute("panel-id") != aTabPanelId) {
      let nextInPanel = window.gBrowser.tabContainer.findNextTab(aTab, {
        direction: 1,
        wrap: false,
        filter: tab => visibleOrInGroup(tab) && tab.getAttribute("panel-id") === aTabPanelId && !tab.pinned,
      });
      if (nextInPanel) {
        skipNextMoveCheck(aTab);
        nativeTreeTabs.moveTabBefore(aTab, nextInPanel);
        setTreeDepth(aTab, 0);
        removeOpener(aTab);
        removeSkipNextMoveCheck(aTab);
        return;
      }
    }
  },

  tabSelected: function(aTab) {

    // function protectSelection() {
    if (aTab && aTab.hasAttribute("nestTab")) {
      if (nativeTreeTabs.selectedTab.hasAttribute("hidden-child") && nativeTreeTabs.selectedTab.getAttribute("hidden-child-rootID") == aTab.getAttribute("tree-id")) {
        aTab.setAttribute("skipUntwist", "");
      }
      let pSTab = nativeTreeTabs.selectedTab;
      if (window.gBrowser.tabs.includes(pSTab) && pSTab.closing == false) {
        if (!pSTab.splitview) {
          gBrowser.selectedTab = pSTab;
        } else {
          setTimeout(() => {
            gBrowser.selectedTab = pSTab;
          }, 10);
        }
      }
      return;
    }
    //nested tabs hidden children might be show =>hide it
    if (this.selectedTab && this.selectedTab != aTab && this.selectedTab.hasAttribute("hidden-child-rootID") && !this.selectedTab.hasAttribute("hidden-child")) {
      this.selectedTab.setAttribute("hidden-child", true);
      setCustomTabValue(this.selectedTab, "hidden-child", 'true');
    }

    if (this.collapseTreesAutomatically.value && this.selectedTab && this.selectedTab != aTab) {
      //collapse previous active tab tree (if different from current true)
      let previousActiveTreeRoot = getTreeRoot(this.selectedTab);
      let currentTreeRoot = getTreeRoot(aTab);
      if (currentTreeRoot != previousActiveTreeRoot) {
        if (!previousActiveTreeRoot.hasAttribute("twisted-root")) {
          this.toggleTwist(previousActiveTreeRoot);
        }
      }
    }
    if (this.collapseGroupsAutomatically.value && this.selectedTab && this.selectedTab != aTab) {
      //collapse previous active tab group
      if (this.selectedTab.group && this.selectedTab.group != aTab.group) {
        this.selectedTab.group.collapsed = true;
      }
    }

    //Select previous selected tab when current selected tab is clicked
    if (aTab !== this.selectedTab) {
      if (this.selectedTab != null && (this.previousSelectedTab.length == 0 || this.previousSelectedTab[this.previousSelectedTab.length - 1] != this.selectedTab)) {
        this.previousSelectedTab.push(this.selectedTab);
        if (this.previousSelectedTab.length > MAX_STACK_SIZE) {
          this.previousSelectedTab = this.previousSelectedTab.slice(1);
        }
      }
      if (this.selectedTab != null) {
        this.selectedTab.removeEventListener("click", this.previousSwitch, true);
      }
      this.selectedTab = aTab;
    }

    aTab.addEventListener("click", this.previousSwitch, true);

    //Hidden tab selected unravel root
    if (aTab.hasAttribute("hidden-child")) {
      this.hiddenSelected(aTab);
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
        if (panel.selectedTab != null && (panel.previousSelectedTab.length == 0 || panel.previousSelectedTab[panel.previousSelectedTab.length - 1] != panel.selectedTab)) {
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
      if (!isTab(nextTab) || !hasTreeDepth(nextTab) ||
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

  hiddenSelected: function(aTab) {
    //Find twisted root and unravel it
    let rootId = aTab.getAttribute("hidden-child-rootID");
    previousTab = this.tabsIds.get(rootId);
    if (previousTab != null) {
      this.toggleTwist(previousTab);
    } else {
      previousTab = getPreviousTab(aTab);
      while (isTab(previousTab)) {
        if (previousTab.hasAttribute("twisted-root") && previousTab.getAttribute("tree-id") === rootId) {
          if (!previousTab.hasAttribute("skipUntwist")) {
            this.toggleTwist(previousTab);
          }
          break;
        }
        previousTab = getPreviousTab(previousTab);
      }
    }
    //Worst case ( tab left hidden and couldn't find hidden root)
    // force unhide
    if (!previousTab || !previousTab.hasAttribute("skipUntwist")) {
      aTab.removeAttribute("hidden-child");
      aTab.removeAttribute("hidden-child-rootID");
      deleteCustomTabValue(aTab, "hidden-child");
      deleteCustomTabValue(aTab, "hidden-child-rootID");
    } else if (previousTab) {
      previousTab.removeAttribute("skipUntwist");
    }
  },
  toggleTwist: function(aTab, forced = false) {
    let nextTab;
    if (aTab.splitview) {
      aTab = aTab.splitview.tabs[0];
      nextTab = getNextTab(aTab.splitview);
    } else nextTab = getNextTab(aTab);

    let treeDepth = getTreeDepth(aTab);
    //Only for tabs with children
    if (!isTab(nextTab) || !hasTreeDepth(nextTab) ||
      (getTreeDepth(nextTab) <= treeDepth))
      return;
    let unhide = false;
    let count = 0;
    let rootId = aTab.getAttribute("tree-id").toString();
    if (aTab.hasAttribute("twisted-root") && !forced) {
      unhide = true;
      aTab.removeAttribute("twisted-root");
      deleteCustomTabValue(aTab, "twisted-root");
    } else {
      aTab.setAttribute("twisted-root", true);
      setCustomTabValue(aTab, "twisted-root", 'true');
    }
    while (nextTab) {
      nextTabTreeDepth = getTreeDepth(nextTab);
      if (nextTabTreeDepth == null || nextTabTreeDepth <= treeDepth) {
        break;
      } else if (unhide) {
        nextTab.removeAttribute("hidden-child");
        nextTab.removeAttribute("hidden-child-rootID");
        deleteCustomTabValue(nextTab, "hidden-child");
        deleteCustomTabValue(nextTab, "hidden-child-rootID");
      } else {
        if (!nextTab.selected || forced) {
          nextTab.setAttribute("hidden-child", true);
          setCustomTabValue(nextTab, "hidden-child", 'true');
        }
        nextTab.setAttribute("hidden-child-rootID", rootId);
        setCustomTabValue(nextTab, "hidden-child-rootID", rootId);
      }
      if (!nextTab.hasAttribute("nestTab"))
        count++;
      //Don't unravel nested hidden trees
      if (nextTab.hasAttribute("twisted-root")) {
        let treeDepthNested = getTreeDepth(nextTab);
        nextTab = getNextTab(nextTab);
        if (nextTab.splitview && nextTab.splitview.tabs.length > 1) {
          if (unhide) {
            nextTab.removeAttribute("hidden-child");
            nextTab.removeAttribute("hidden-child-rootID");
            deleteCustomTabValue(nextTab, "hidden-child");
            deleteCustomTabValue(nextTab, "hidden-child-rootID");
          } else {
            if (!nextTab.selected || forced) {
              nextTab.setAttribute("hidden-child", true);
              setCustomTabValue(nextTab, "hidden-child", 'true');
            }
            nextTab.setAttribute("hidden-child-rootID", rootId);
            setCustomTabValue(nextTab, "hidden-child-rootID", rootId);
          }
          count++;
          nextTab = getNextTab(nextTab);
        }
        while (nextTab) {
          nextTabTreeDepthNested = getTreeDepth(nextTab);
          if (nextTabTreeDepthNested == null || nextTabTreeDepthNested <= treeDepthNested) {
            break;
          }
          if (!nextTab.hasAttribute("nestTab"))
            count++;
          nextTab = getNextTab(nextTab);
        }
      } else nextTab = getNextTab(nextTab);
    }
    addTabChildCount(aTab, count, unhide);
  },

  nestClick: function(aEvent) {
    let aTab = aEvent.target.closest('tab');
    if (aEvent.button == 0) {
      if (aEvent.ctrlKey || aEvent.shiftKey) {
        return;
      }
      // if(!aTab.hasAttribute("untwist")){
      nativeTreeTabs.toggleTwist(aTab);
      // }
    } else if (aEvent.button == 1) {
      nativeTreeTabs.closeTree(aEvent);
      if (aTab) {
        gBrowser.removeTab(aTab);
      }
      // aEvent.preventDefault();
      // aEvent.stopPropagation()
    }
  },

  twistyClick: function(aEvent) {
    if (!SidebarController._sidebarMain.__expanded) {
      return;
    }
    let aTab = aEvent.target.closest('tab');
    if (!aTab.hasAttribute("nestTab") && !aTab.splitview) {
      this.toggleTwist(aTab);
    } else if (aTab.splitview && aTab.splitview.firstChild == aTab) {
      this.toggleTwist(aTab);
    }
  },

  tabClose: function(aTab) {
    if (aTab.hasAttribute("panel-id")) {
      let panelId = aTab.getAttribute("panel-id");
      window.nativeTreeTabs.panelDecreaseCount(panelId, aTab);
    }
    if (aTab.splitview) {
      if (aTab.splitview.tabs.length > 1 && aTab.splitview.tabs[0] == aTab && aTab.hasAttribute("twisted-root")) {
        this.toggleTwist(aTab);
      }
    } else {
      this.tabLeaveStrip(aTab);
    }
  },

  tabLeaveStrip: function(aTab, forceMultiselected = false) {
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
        setCustomTabValue(newRoot, "twisted-root", 'true');
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
          setCustomTabValue(nextTab, "hidden-child-rootID", rootId);
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
      if ((!multiSelected(nextTab) || forceMultiselected) && !nextTab.hasAttribute("draggedFromWindow")) {
        setTreeDepth(nextTab, newDepth);
      }
      nextTab = getNextTab(nextTab);
    }
  },

  tabRestore: function(aTab) {
    let restoredDepth = getCustomTabValue(aTab, "tree-depth");
    let restoredOpenerId = getCustomTabValue(aTab, "opener-id");

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
      let restoredTreeId = getCustomTabValue(aTab, "tree-id");
      if (restoredTreeId) {
        aTab.setAttribute("tree-id", restoredTreeId);
        window.nativeTreeTabs.tabsIds.set(restoredTreeId, aTab);
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
    let nestTab = getCustomTabValue(aTab, "nestTab");
    if (nestTab) {
      aTab.setAttribute("nestTab", "");
      aTab.label = nestTab;
    }

    let twistedRoot = getCustomTabValue(aTab, "twisted-root");
    if (twistedRoot) {
      aTab.setAttribute("twisted-root", true);
      restoreCount(aTab);
    }

    let hiddenChild = getCustomTabValue(aTab, "hidden-child");
    let hiddenChildRoot = getCustomTabValue(aTab, "hidden-child-rootID");
    if (hiddenChild && hiddenChildRoot) {
      aTab.setAttribute("hidden-child", true);
      aTab.setAttribute("hidden-child-rootID", hiddenChildRoot);
      if (aTab.selected) {
        this.hiddenSelected(aTab);
      }
    }
    let restorePaneldId = getCustomTabValue(aTab, "panel-id");

    if (restorePaneldId) {
      panelId = restorePaneldId.toString();
      let panel = this.tabPanels.find(x => x.id.toString() === panelId);

      if (!panel) {
        //panel no longer exists => restore it
        let relabel = "restored " + panelId;
        let restorePanelLabel = getCustomTabValue(aTab, "panel-label");
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

    if (aTab.splitview) {
      if (this.originalUnsplitTabs.get(aTab.splitview.splitViewId) == null) {
        this.overwriteUnsplitFunction(aTab.splitview);
        this.overwriteReverseSplitFunction(aTab.splitview);
      }
    }
  },

  removeTabListeners: function() {
    gBrowser.tabs.forEach(function(aTab) {
      aTab.removeEventListener("dragend", this);
      aTab.removeEventListener("dragstart", this);
      aTab.querySelector(".tab-icon-stack").removeEventListener("click", this);
      aTab.querySelector(".tab-close-button").removeEventListener("click", this);
      aTab.removeEventListener("click", this.previousSwitch, true);
      if (aTab.hasAttribute("nestTab"))
        aTab.removeEventListener("click", this.nestClick);
    }, this);
  },

  initTab: function(aTab) {

    let dragged = getCustomTabValue(aTab, "draggedFromWindow");

    if ((aTab.hasAttribute("tree-id") && dragged == null) || aTab.closing) {
      //already initialized
      return;
    }

    //Solo tab in window
    let soloTab = (window.gBrowser.tabs.length == 1) ? true : false;
    let restoredId = getCustomTabValue(aTab, "tree-id");

    if (!restoredId) {
      //Generate new unique id 
      let timeNow = (performance.now() + performance.timeOrigin).toFixed(3) * 1000;
      while (timeNow === this.lastId) timeNow = timeNow + 1;
      this.lastId = timeNow;
      setTabTreeID(aTab, timeNow.toString());
    } else {
      aTab.setAttribute("tree-id", restoredId);
      window.nativeTreeTabs.tabsIds.set(restoredId, aTab);
    }

    let treeDepth = getCustomTabValue(aTab, "tree-depth");

    if (treeDepth && !soloTab) {
      //add a fix for out of order restore
      aTab.setAttribute("tree-depth", treeDepth);
    } else {
      treeDepth = aTab.getAttribute("tree-depth");
      //Tab didn't depth initialized for some reason
      if (treeDepth == null) {
        treeDepth = this.initTreeDepth(aTab);
      }
      setCustomTabValue(aTab, "tree-depth", treeDepth.toString());
    }

    let openerId = getCustomTabValue(aTab, "opener-id");

    if (openerId) {
      aTab.setAttribute("opener-id", openerId);
    } else {
      if (aTab.openerTab != null && parseInt(treeDepth, 10) != 0) {
        setOpener(aTab, aTab.openerTab);
      }
    }

    setDomainAttr(aTab);

    let twistedRoot = getCustomTabValue(aTab, "twisted-root");

    if (twistedRoot) {
      aTab.setAttribute("twisted-root", true);
      restoreCount(aTab);
    }

    let nestTab = getCustomTabValue(aTab, "nestTab");
    if (nestTab) {
      aTab.setAttribute("nestTab", "");
      aTab.label = nestTab;
      aTab.addEventListener("click", this.nestClick);
    }

    let previousTab = getPreviousTab(aTab);

    let hiddenChild = getCustomTabValue(aTab, "hidden-child");
    let hiddenChildRoot = getCustomTabValue(aTab, "hidden-child-rootID");
    if (hiddenChild && hiddenChildRoot) {
      aTab.setAttribute("hidden-child", true);
      aTab.setAttribute("hidden-child-rootID", hiddenChildRoot);
      increaseChildCount(aTab);
    }

    let restorePaneldId = getCustomTabValue(aTab, "panel-id");
    let foundPanel = false;
    //Don't restore panel for out of window dragging

    if (dragged) {
      deleteCustomTabValue(aTab, "draggedFromWindow");
      let thisWindowId = window.docShell.outerWindowID.toString();
      if (dragged != thisWindowId) {
        restorePaneldId = false;
      }
    }

    function findPreviousInPanel(xTab, xTabPanelId) {
      //first of a panel here or a wrong one
      let correction = false;
      previousInPanel = window.gBrowser.tabContainer.findNextTab(xTab, {
        direction: -1,
        wrap: false,
        filter: tab => tab.getAttribute("panel-id") === xTabPanelId && !tab.pinned,
      });
      if (previousInPanel) {
        correction = true;
        if (xTab.group) {
          let tabToMoves = xTab.group;
          tabToMoves.tabs.forEach(function(mTab) {
            skipNextMoveCheck(mTab);
          }, this);
          nativeTreeTabs.moveTabAfter(tabToMoves, previousInPanel);
          tabToMoves.tabs.forEach(function(mTab) {
            removeSkipNextMoveCheck(mTab);
          }, this);
        } else {
          skipNextMoveCheck(xTab);
          nativeTreeTabs.moveTabAfter(xTab, previousInPanel);
          removeSkipNextMoveCheck(xTab);
        }
      }
      return correction;
    }

    if (restorePaneldId) {
      panelId = restorePaneldId.toString();
      let panel = this.tabPanels.find(x => x.id.toString() === panelId);

      if (!panel) {
        //panel no longer exists => restore it
        let relabel = "restored " + panelId;
        let restorePanelLabel = getCustomTabValue(aTab, "panel-label");
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
          //usually for the first panel
          addNewPanelInMenu(panel, checkIt = false);
        } else {
          //Panel is in menu
          if (!aTab.pinned && previousTab && previousTab.hasAttribute("panel-id") && previousTab.getAttribute("panel-id") != panel.id.toString()) {
            //check if same panel tabs exist already but we are in wrong position
            let moveToCorrect = findPreviousInPanel(aTab, panel.id.toString());
            if (moveToCorrect == false) {
              //no other same panel tabs exist
              let previousPanelId = previousTab.getAttribute("panel-id");
              let previousPanelIndex = nativeTreeTabs.tabPanels.findIndex(x => x.id.toString() === previousPanelId);
              if (previousPanelIndex && nativeTreeTabs.tabPanels.indexOf(panel) < previousPanelIndex) {
                //Panel is in wrong position on the menu => move it
                // probably caused by pinned tab restore (happens first of all)
                moveItemInTheArray(nativeTreeTabs.tabPanels, nativeTreeTabs.tabPanels.indexOf(panel), previousPanelIndex);
                let menupopup = document.getElementById('tab-panels-menupopup-view');
                //Put it in the right position
                if (menupopup) {
                  let panelItemInmenu = menupopup.querySelector('[panel-id="' + panel.id.toString() + '"]');
                  let prevPanelItemInmenu = menupopup.querySelector('[panel-id="' + previousPanelId + '"]');
                  if (prevPanelItemInmenu && panelItemInmenu) {
                    prevPanelItemInmenu.after(panelItemInmenu);
                  }
                }
                let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
                let contextItem = tabContextMenupopup.querySelector('#moveTo-panel-' + panel.id.toString());
                let prevItemContext = tabContextMenupopup.querySelector('#moveTo-panel-' + previousPanelId);
                if (tabContextMenupopup && contextItem && prevItemContext) {
                  prevItemContext.after(contextItem);
                }
              }
            }
          } else if (!aTab.pinned && !previousTab && nativeTreeTabs.tabPanels.indexOf(panel) != 0) {
            //Case of no previous tab in strip (excluding pinned tabs)
            // Panel should be first in the array but isn't => move it
            // let menupopup = document.getElementById('tab-panels-menupopup-view');
            // if (menupopup) {
            //   let panelItemInmenu = menupopup.querySelector('[panel-id="' + panel.id.toString() + '"]');
            //   let firstPanelInMenu = menupopup.parentNode.querySelector('#tab-panels-menupopup-view > menuitem');
            //   if (panelItemInmenu && firstPanelInMenu) {
            //     menupopup.insertBefore(panelItemInmenu, firstPanelInMenu);
            //   }
            // }
          }
        }
      }
      setPanel(aTab, panel, window);
      foundPanel = true;

      if (aTab.selected) {
        if (this.selectedtPanel != panel) {
          this.tabPanelShow(panel, changeSelectedTab = false);
        }
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
      findPreviousInPanel(aTab, aTabPanelId);
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
    // let previousTab = getPreviousTab(aTab);
    // if (previousTab != null) {
    //   let nTab = getNextTab(aTab);
    //   //Move tabs that open under the hidden-tabs (not selected tab panel tabs)
    //   let nextNotHidden = (nTab != null && !nTab.hasAttribute("tabPanel-hidden")) ?
    //     true : false;
    //   if (previousTab.hasAttribute("tabPanel-hidden") && !nextNotHidden) {
    //     let newPosition = previousTab;
    //     while (isTab(previousTab) && previousTab.hasAttribute("tabPanel-hidden")) {
    //       newPosition = previousTab;
    //       previousTab = getPreviousTab(previousTab);
    //     }
    //     if (isTab(previousTab)) {
    //       skipNextMoveCheck(aTab);
    //       nativeTreeTabs.moveTabBefore(aTab, newPosition);
    //       removeSkipNextMoveCheck(aTab);
    //     }
    //   }
    // }

    let treeDepth = 0;
    if (rootTab != null && !rootTab.pinned) {
      let parentDepth = getTreeDepth(rootTab);
      if (parentDepth != null) {
        treeDepth = parentDepth + 1;
        let newPosition = getPositionUnderRoot(rootTab);
        skipNextMoveCheck(aTab);
        //Move new tabs directly under parent
        if (this.moveNewTabsDirectlyUnderParent.value) {
          gBrowser.moveTabAfter(aTab, rootTab);
        } else {
          gBrowser.moveTabAfter(aTab, getLastInTree(rootTab));
        }
        removeSkipNextMoveCheck(aTab);
      }
    }
    //Case when a zero depth tab spawns inside a tree
    else if (rootTab == null && getPreviousTab(aTab) != null && getNextTab(aTab) != null) {
      previousTab = getPreviousTab(aTab);
      let nextDepth = getTreeDepth(getNextTab(aTab));
      let prvDepth = getTreeDepth(previousTab);
      if (prvDepth != null && treeDepth <= prvDepth && nextDepth != null && (prvDepth <= nextDepth && nextDepth != 0)) {
        treeDepth = nextDepth;
      }
    }
    aTab.setAttribute("tree-depth", treeDepth);
    if (rootTab != null && rootTab.hasAttribute("twisted-root")) {
      this.toggleTwist(rootTab);
    }
    let dragged = getCustomTabValue(aTab, "draggedFromWindow");
    setTimeout(() => {
      if (!aTab.hasAttribute("tree-id") || dragged != null) {
        this.initTab(aTab);
      }
    }, 100);

    return treeDepth;
  },

  observe: function(subject, topic, name) {

    if (topic == "nsPref:changed") {
      if (name == "treeTabs.enabled") {
        let enabled = getPref("treeTabs.enabled");
        if (enabled == true && nativeTreeTabs._initialized == false) {
          nativeTreeTabs.init();
        } else if (enabled == false && nativeTreeTabs._initialized == true) {
          nativeTreeTabs.uninit();
        }
        return;
      }
      let included = nativeTreeTabs.observedPrefs.get(name);
      if (included != null) {
        let value = getPref(name);
        if (value != null) {
          if (included.hasOwnProperty('keys')) {
            //keyboard shortcut
            if (value == "reset") {
              //reset button
              //restore default value
              setPref(name, included.value);
              included.keys = parseShortcut(included.value);
            } else
              //New keys set
              included.keys = parseShortcut(value);

          } else {
            included.value = value;
          }
          if (included.hasOwnProperty('onEnable') && value == true) {
            included.onEnable.call(this, true);
          }
          if (included.hasOwnProperty('onDisable') && value == false) {
            included.onDisable.call(this, false);
          }

        } else {
          if (!included.hasOwnProperty('keys')) {
            //Deleted => restore last saved
            setPref(name, included.value)
          }
        }
        return;
      }

      let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
        Ci.nsIStyleSheetService
      );
      nativeTreeTabs.customStyle.forEach(function(style) {
        styleSvc.unregisterSheet(style[0], style[1]);
      });
      nativeTreeTabs.customStyle.push(loadNTTstyle());
      nativeTreeTabs.customStyle.push(loadTabPanelsstyle());
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

  observeTopic: function(topic, customVar = null, setValue = null) {
    let topicValue = getPref(topic);
    if (customVar != null) {
      if (topicValue != null) {
        customVar.value = topicValue;
        if (customVar.hasOwnProperty('keys')) {
          customVar.keys = parseShortcut(topicValue);
          customVar.value = setValue;
        } else {
          customVar.value = topicValue;
        }
      } else if (setValue != null) {
        setPref(topic, setValue);
        customVar.value = setValue;
        if (customVar.hasOwnProperty('keys')) {
          customVar.keys = parseShortcut(setValue);
        }
      }
      if (customVar.hasOwnProperty('onEnable') && topicValue != false &&
        (topicValue == true || setValue == true)) {
        setTimeout(() => {
          customVar.onEnable.call(this, true);
        }, 100);
      }
    } else if (setValue != null) {
      if (topicValue == null)
        setPref(topic, setValue);
    }
    this.observedPrefs.set(topic, customVar);
    Services.prefs.addObserver(topic, this);
  },

  initPreferences: function() {
    this.observeTopic("treeTabs.behavior.lockCtrlTabInPanel", this.lockCtrlTabInPanel, this.lockCtrlTabInPanel.value);
    this.observeTopic("treeTabs.behavior.switchSelectedOnClick", this.switchSelectedOnClick, this.switchSelectedOnClick.value);
    this.observeTopic("treeTabs.behavior.switchSelectedOnClickStayOnPanel", this.switchSelectedOnClickStayOnPanel, this.switchSelectedOnClickStayOnPanel.value);
    this.observeTopic("treeTabs.behavior.hopOverUnloadedTabs", this.hopOverUnloadedTabs, this.hopOverUnloadedTabs.value);
    this.observeTopic("treeTabs.behavior.hopOverCollapsedTabs", this.hopOverCollapsedTabs, this.hopOverCollapsedTabs.value);
    this.observeTopic("treeTabs.behavior.hopOverCollapsedTabsInlcudeRestored", this.hopOverCollapsedTabsIncludeRestoredTabs, this.hopOverCollapsedTabsIncludeRestoredTabs.value);
    this.observeTopic("treeTabs.behavior.collapseTreesAutomatically", this.collapseTreesAutomatically, this.collapseTreesAutomatically.value);
    this.observeTopic("treeTabs.behavior.collapseGroupsAutomatically", this.collapseGroupsAutomatically, this.collapseGroupsAutomatically.value);
    this.observeTopic("treeTabs.behavior.smartResizeSidebar", this.autohideSidebar, this.autohideSidebar.value);
    this.observeTopic("treeTabs.behavior.smartResizeSidebarNormalModeAutoExpand", this.autohideSidebarNormalModeAutoExpand, this.autohideSidebarNormalModeAutoExpand.value);
    this.observeTopic("treeTabs.behavior.changePanelOnScroll", this.changePanelOnScroll, this.changePanelOnScroll.value);
    this.observeTopic("treeTabs.behavior.switchOnClose", this.switchOnClose, this.switchOnClose.value);


    this.observeTopic("treeTabs.rootTabTopMargin");
    this.observeTopic("treeTabs.branchTabTopMargin");
    this.observeTopic("treeTabs.tabHeight");
    this.observeTopic("treeTabs.labelFontSize");
    this.observeTopic("treeTabs.tabBorderRadius");
    this.observeTopic("treeTabs.style.tabIconStart");
    this.observeTopic("treeTabs.style.pinnedTabWidth");
    this.observeTopic("treeTabs.style.collapsedChildrenCounter", null, true);
    this.observeTopic("treeTabs.style.customText", null, true);
    this.observeTopic("treeTabs.style.customBackground", null, true);
    this.observeTopic("treeTabs.style.customGroups", null, true);
    this.observeTopic("treeTabs.style.twistyStyle", null, 0);
    this.observeTopic("treeTabs.style.hideContainerLine", null, true);

    this.observeTopic("treeTabs.defaultPanelName", this.defaultPanelName, this.defaultPanelName.value);
    this.observeTopic("browser.tabs.insertRelatedAfterCurrent", this.moveNewTabsDirectlyUnderParent);

    Services.prefs.setBoolPref("browser.tabs.dragDrop.createGroup.enabled", false);
    Services.prefs.setBoolPref("browser.tabs.groups.smart.enabled", false);
    Services.prefs.setBoolPref("svg.context-properties.content.enabled", true);

  },

  overwriteReverseSplitFunction: function(splitview) {

    let originalReverseTabs = splitview.reverseTabs;
    nativeTreeTabs.originalReverseTabs.set(splitview.splitViewId, originalReverseTabs);
    splitview.reverseTabs = function(trigger = null) {
      try {
        if (splitview.tabs.length > 1 && splitview.tabs[0].hasAttribute("twisted-root")) {
          nativeTreeTabs.toggleTwist(splitview.tabs[0]);
        }
        splitview.tabs.forEach(function(sTab) {
          skipNextMoveCheck(sTab);
        }, this);
        originalReverseTabs.apply(this, arguments);
        splitview.tabs.forEach(function(sTab) {
          removeSkipNextMoveCheck(sTab);
        }, this);

      } catch (error) {
        console.error(error);
        originalReverseTabs.apply(this, arguments);
        return;
      }
    };
  },

  overwriteUnsplitFunction: function(splitview) {

    function getFirstSplitViewTabChildren(t) {
      let firstChildren = new Array();
      let tDepth = getTreeDepth(t);
      let firstTabId = t.tabs[0].getAttribute("tree-id");
      if (tDepth == null) {
        return firstChildren;
      }
      let nextTab = getNextTab(t);
      while (isTab(nextTab)) {
        nextDepth = getTreeDepth(nextTab);
        if (nextDepth == null || nextDepth <= tDepth) {
          break;
        }
        if (nextTab.getAttribute("opener-id") == firstTabId) {
          firstChildren.push(nextTab);
          nextTab.setAttribute("saveDepthLevel", nextDepth);
          childDepth = getTreeDepth(nextTab);
          nextTab = getNextTab(nextTab);
          while (isTab(nextTab)) {
            nextDepth = getTreeDepth(nextTab);
            if (nextDepth == null || nextDepth <= childDepth) {
              break;
            }
            nextTab.setAttribute("saveDepthLevel", nextDepth);
            firstChildren.push(nextTab);
            nextTab = getNextTab(nextTab);
          }
        } else {
          nextTab = getNextTab(nextTab);
        }
      }
      return firstChildren;
    }

    function maybeMoveSplitChildren(children, aTab) {
      if (children != null && children.length > 0) {
        children.forEach(function(cTab) {
          setTreeDepth(cTab, cTab.getAttribute("saveDepthLevel"));
          cTab.removeAttribute("saveDepthLevel");
          skipNextMoveCheck(cTab);
        }, this);
        gBrowser.moveTabsAfter(children, aTab, {
          metricsContext: gBrowser.TabMetrics.userTriggeredContext(
            gBrowser.TabMetrics.METRIC_SOURCE.DRAG_AND_DROP
          )
        });
        children.forEach(function(cTab) {
          removeSkipNextMoveCheck(cTab);
        }, this);
      }
    }

    let originalUnsplitTabs = splitview.unsplitTabs;
    nativeTreeTabs.originalUnsplitTabs.set(splitview.splitViewId, originalUnsplitTabs);
    splitview.unsplitTabs = function(trigger = null) {
      try {
        let saveFirstTabChildren;
        let firstTab;
        if (splitview.tabs != null && splitview.tabs.length > 1 && splitview.tabs[0] != null) {
          firstTab = splitview.tabs[0];
          saveFirstTabChildren = getFirstSplitViewTabChildren(splitview);
        }
        splitview.tabs.forEach(function(sTab) {
          skipNextMoveCheck(sTab);
        }, this);
        originalUnsplitTabs.apply(this, arguments);
        splitview.tabs.forEach(function(sTab) {
          removeSkipNextMoveCheck(sTab);
        }, this);
        maybeMoveSplitChildren(saveFirstTabChildren, firstTab);
      } catch (error) {
        console.error(error);
        originalUnsplitTabs.apply(this, arguments);
        return;
      }
    };
  },

  defaultFunctionWrap: function() {
    this.originalRemoveTabs = gBrowser.removeTabs;
    gBrowser.removeTabs = function(tabs, aOptions) {
      try {
        tabs.forEach(function(tab) {
          let previousTab = getPreviousTab(tab);
          if (previousTab && previousTab.hasAttribute("nestTab") && !tabs.includes(previousTab)) {
            let nestTab = previousTab;
            let nextTab = getNextTab(nestTab);
            let nestTabDepth = getTreeDepth(nestTab);
            let tabLeft = false;
            while (nextTab) {
              let nextTabTreeDepth = getTreeDepth(nextTab);
              if (nextTabTreeDepth != null && nextTabTreeDepth <= nestTabDepth) {
                break;
              }
              if (!tabs.includes(nextTab)) {
                tabLeft = true;
                break;
              }
              nextTab = getNextTab(nextTab);
            }
            if (tabLeft == false) {
              nativeTreeTabs.tabLeaveStrip(nestTab, forceMultiselected = true);
              gBrowser.removeTab(nestTab);
            }
          }
        });
        nativeTreeTabs.originalRemoveTabs.apply(this, arguments);
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalRemoveTabs.apply(this, arguments);
        return;
      }
    };

    this.originalRemoveTab = gBrowser.removeTab;
    gBrowser.removeTab = function(aTab, aOptions) {
      //Use setSuccessor to set the next tab to focus when the active tab closes

      function checkForNextNestClose(aTab) {
        //Check if a nest tab last child closes => close it
        let previousTab = getPreviousTab(aTab);
        if (previousTab && previousTab.hasAttribute("nestTab")) {
          let nextTab = getNextTab(aTab);
          if (!nextTab || getTreeDepth(nextTab) == 0) {
            //close nest tab ( no children left)
            setTreeDepth(aTab, 0)
            skipNextMoveCheck(previousTab);
            //move it to not break order on restore
            gBrowser.moveTabToEnd(previousTab);
            removeSkipNextMoveCheck(previousTab);
            gBrowser.removeTab(previousTab);
          }
        }
      }

      function getTabByDirection(aTab, dir) {
        //Don't select another panel(hidden one) tabs if a not hidden pinned tab exists
        let foundTab = window.gBrowser.tabContainer.findNextTab(aTab, {
          direction: dir,
          wrap: false,
          filter: tab => tabVisible(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
        });
        return foundTab
      }

      function getTabByDirectionForced(aTab, dir) {
        let foundTab;
        if (nativeTreeTabs.hopOverUnloadedTabs.value == true && nativeTreeTabs.lockCtrlTabInPanel.value == false) {
          //last chance will go to another panel
          foundTab = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: dir,
            wrap: false,
            filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab),
          });
          if (foundTab == null) {
            foundTab = window.gBrowser.tabContainer.findNextTab(aTab, {
              direction: dir * (-1),
              wrap: false,
              filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab),
            });
          }
        }
        if (foundTab == null) {
          //second try stay in panel even if tab is hidden (for example collapsed group)?
          foundTab = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: dir,
            wrap: false,
            filter: tab => visibleOrInGroup(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
          });
        }
        if (foundTab == null) {
          foundTab = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: dir * (-1),
            wrap: false,
            filter: tab => visibleOrInGroup(tab) && unloadedCheck(tab) && !tab.hasAttribute("tabPanel-hidden"),
          });
        }
        if (foundTab == null) {
          //last chance will go to another panel
          foundTab = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: dir,
            wrap: false,
            filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab),
          });
        }
        if (foundTab == null) {
          foundTab = window.gBrowser.tabContainer.findNextTab(aTab, {
            direction: dir * (-1),
            wrap: false,
            filter: tab => (tabVisible(tab) || inNoCollapsedGroup(tab)) && unloadedCheck(tab),
          });
        }
        return foundTab;
      }

      try {
        checkForNextNestClose(aTab);
        if (aTab.hasAttribute("tabPanel-hidden")) {
          return;
        }
        if (aTab.selected) {
          function findPossibleSwitch(aTab, switchOnClose, previousChecked = -1) {
            let previousTab = getPreviousTab(aTab);
            let nextTab = getNextTab(aTab);
            let activeDepth = getTreeDepth(aTab);
            let foundTab;
            let i = 0;

            function findNextTabByCase(aTab, val) {
              let possibleSwitch;
              if (val === 0) {
                possibleSwitch = nextTab;
                while (isTab(possibleSwitch)) {
                  if (possibleSwitch.hasAttribute("tabPanel-hidden"))
                    break;
                  let depth = getTreeDepth(possibleSwitch);
                  if (depth <= activeDepth)
                    break;
                  if (unloadedCheck(possibleSwitch) && !possibleSwitch.hasAttribute("nestTab") && tabVisible(possibleSwitch))
                    return possibleSwitch;
                  possibleSwitch = getNextTab(possibleSwitch);
                }
              } else if (val === 1) {
                possibleSwitch = previousTab;
                while (isTab(possibleSwitch)) {
                  if (possibleSwitch.hasAttribute("tabPanel-hidden"))
                    break;
                  let depth = getTreeDepth(possibleSwitch);
                  if (depth < activeDepth)
                    break;
                  if (depth == activeDepth && unloadedCheck(possibleSwitch) && !possibleSwitch.hasAttribute("nestTab") && tabVisible(possibleSwitch))
                    return possibleSwitch;
                  possibleSwitch = getPreviousTab(possibleSwitch)
                }
              } else if (val === 2) {
                possibleSwitch = nextTab;
                while (isTab(possibleSwitch)) {
                  if (possibleSwitch.hasAttribute("tabPanel-hidden"))
                    break;
                  let depth = getTreeDepth(possibleSwitch);
                  if (depth < activeDepth)
                    break;
                  if (depth == activeDepth && unloadedCheck(possibleSwitch) && !possibleSwitch.hasAttribute("nestTab") && tabVisible(possibleSwitch))
                    return possibleSwitch;
                  possibleSwitch = getNextTab(possibleSwitch);
                }
              } else if (val === 3) {
                possibleSwitch = previousTab;
                while (isTab(possibleSwitch)) {
                  if (possibleSwitch.hasAttribute("tabPanel-hidden"))
                    break;
                  let depth = getTreeDepth(possibleSwitch);
                  if (depth < activeDepth && unloadedCheck(possibleSwitch) && !possibleSwitch.hasAttribute("nestTab") && tabVisible(possibleSwitch))
                    return possibleSwitch;
                  if (depth < activeDepth)
                    break;
                  possibleSwitch = getPreviousTab(possibleSwitch)
                }
              } else if (val === 4) {
                possibleSwitch = getTabByDirection(aTab, -1);
                if (possibleSwitch != null) {
                  return possibleSwitch;
                }
              } else if (val === 5) {
                possibleSwitch = getTabByDirection(aTab, 1);
                if (possibleSwitch != null) {
                  return possibleSwitch;
                }
              } else if (val === 54) {
                possibleSwitch = getTabByDirectionForced(aTab, previousChecked);
                if (possibleSwitch != null) {
                  return possibleSwitch;
                }
              } else if (val === 6 || val === 7) {
                let source = (val === 7) ? nativeTreeTabs.selectedtPanel.previousSelectedTab : nativeTreeTabs.previousSelectedTab;
                let pSTab = source.pop();
                while (source.length > 0 && (pSTab == null || pSTab === aTab || !window.gBrowser.tabs.includes(pSTab))) {
                  pSTab = source.pop();
                }
                if (pSTab && pSTab != aTab && !pSTab.closing) {
                  return pSTab;
                }
              }
            }
            while (foundTab == null && i < switchOnClose.length - 1) {
              foundTab = findNextTabByCase(aTab, parseInt(switchOnClose[i], 10));
              i++;
            }
            return foundTab;
          }
          let switchOnClose = nativeTreeTabs.switchOnClose.value;
          switchOnClose = switchOnClose.split(",");
          let findTab = findPossibleSwitch(aTab, switchOnClose);
          if (findTab != null) {
            gBrowser.setSuccessor(aTab, findTab);
          }
        }
        nativeTreeTabs.originalRemoveTab.apply(this, arguments);
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalRemoveTab.apply(this, arguments);
        return;
      }
    };

    //Tab pinning
    this.originalPinTab = gBrowser.pinTab;
    gBrowser.pinTab = function(aTab, aOptions) {
      try {
        if (aTab.hasAttribute("nestTab")) {
          return;
        }
        removeTreeOutline(getPosition(aTab), aTab);
        nativeTreeTabs.tabLeaveStrip(aTab);
        setTreeDepth(aTab, 0);
        if (getPosition(aTab) != 0) {
          skipNextMoveCheck(aTab);
        }
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalPinTab.apply(this, arguments);
        return;
      }
      nativeTreeTabs.originalPinTab.apply(this, arguments);
      removeSkipNextMoveCheck(aTab);

    };
    //tab context menu enable split view for pinned
    this.originalUpdateContextMenu = TabContextMenu.updateContextMenu;
    TabContextMenu.updateContextMenu = function(aPopupMenu) {
      try {
        nativeTreeTabs.originalUpdateContextMenu.apply(this, arguments);
        let splitViewEnabled = Services.prefs.getBoolPref(
          "browser.tabs.splitView.enabled",
          false
        );
        if (splitViewEnabled != false) {
          let contextMoveTabToNewSplitView = document.getElementById(
            "context_moveTabToSplitView"
          );
          if (contextMoveTabToNewSplitView.disabled == true) {
            let pinnedTabs = this.contextTabs.filter(t => t.pinned);
            if (pinnedTabs.length) {
              let customizeTabs = this.contextTabs.filter(t =>
                t.hasAttribute("customizemode"));
              contextMoveTabToNewSplitView.disabled =
                TabContextMenu.contextTabs.length > 2 ||
                customizeTabs.length;
            }
          }
        }
      } catch (error) {
        console.error(error);
        return;
      }
    };

    //Split View creation
    this.originalAddTabSplitView = gBrowser.addTabSplitView;
    gBrowser.addTabSplitView = function(tabsToAdd, {
      insertBefore,
      trigger,
    }) {
      try {
        let pinnedTabs = tabsToAdd.filter(t => t.pinned);
        pinnedTabs.forEach(function(t) {
          gBrowser.unpinTab(t);
        });
        // nativeTreeTabs.moveSplitView(tabsToAdd, insertBefore);
        tabsToAdd.forEach(function(t) {
          skipNextMoveCheck(t);
        });
        let moveSecondTabChildren = false;
        let secondOldDepth;
        let movingTab = tabsToAdd.find(t => t != insertBefore);
        let isAncestor = (tabsToAdd.length > 1 && checkIfIsAncestor(insertBefore, movingTab)) ?
          true : false;
        let firstTreeDepth = isAncestor ? getTreeDepth(movingTab) : getTreeDepth(insertBefore);

        if (tabsToAdd.length > 1) {
          // nativeTreeTabs.tabLeaveStrip(tabsToAdd[1]);
          moveSecondTabChildren = true;
          movingOldPosition = getPosition(movingTab);
          movingOldDepth = getTreeDepth(movingTab);
          insertOldPosition = getPosition(insertBefore);
          insertOldDepth = getTreeDepth(insertBefore);

          function makeSureOpenerIsSet(t) {
            let tDepth = getTreeDepth(t);
            let tNext = getNextTab(t);
            while (tNext) {
              tNextDepth = getTreeDepth(tNext);
              if (tDepth == null || tNextDepth <= tDepth) {
                break;
              }
              if (tNextDepth == tDepth + 1) {
                setOpener(tNext, t);
              }
              tNext = getNextTab(tNext);
            }
          }
          tabsToAdd.forEach(makeSureOpenerIsSet);
        }

        nativeTreeTabs.originalAddTabSplitView.apply(this, arguments);
        tabsToAdd.forEach(function(t) {
          setTreeDepth(t, firstTreeDepth);
          removeSkipNextMoveCheck(t);
        });
        if (isAncestor) {
          nativeTreeTabs.updateChildrenFromIndex(insertBefore, insertOldPosition, getPosition(insertBefore), insertOldDepth, groupState = false, forceMultiselected = false, splitViewCreation = true);
        }
        if (moveSecondTabChildren) {
          nativeTreeTabs.updateChildrenFromIndex(movingTab, movingOldPosition, getPosition(movingTab), movingOldDepth, groupState = false, forceMultiselected = false, splitViewCreation = true);
        }
        if (tabsToAdd[0] && tabsToAdd[0].splitview) {
          let splitview = tabsToAdd[0].splitview;
          //Overwrite unsplit and tab reverse functions of the object
          nativeTreeTabs.overwriteUnsplitFunction(splitview);
          nativeTreeTabs.overwriteReverseSplitFunction(splitview);
        }
        // if(tabsToAdd[0]&& tabsToAdd[0].splitview)
        // tabsToAdd[0].splitview.addEventListener("dragend", window.nativeTreeTabs);
        // aTab.addEventListener("dragstart", this);
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalAddTabSplitView.apply(this, arguments);
        return;
      }
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
        if (nativeTreeTabs.lockCtrlTabInPanel.value === false) {
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
            let nextPanelId;
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
        if (startTab && startTab.hidden) {
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
          if (multiSelected(aTab) && multiSelected(tabs[i])) {
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
          if (multiSelected(aTab) && multiSelected(tabs[i])) {
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
          if (aTab != null && multiSelected(aTab)) {
            filterFn = tab => !multiSelected(tab) && !tab.pinned && tabVisible(tab) && !tab.hasAttribute("tabPanel-hidden");
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

    //add collapsed tree preview popup
    let popup = document.createXULElement("panel");
    popup.id = "preview-collapsed-tree";
    popup.setAttribute('type', 'arrow');
    popup.setAttribute('noautofocus', 'true');
    popup.setAttribute('norolluponanchor', 'true');
    popup.setAttribute('role', 'menu');

    popup.setAttribute("class", "animatable-menupopup toolbar-menupopup");

    let menuMainDiv = document.createElement('div');
    menuMainDiv.setAttribute("class", "popup-main-panel");
    menuMainDiv.style.display = "flex";
    menuMainDiv.style.flexFlow = "column";

    popup.appendChild(menuMainDiv);

    let mainPopupSet = document.getElementById('mainPopupSet');
    mainPopupSet.appendChild(popup);
    this.domElements.push(popup);

    gBrowser.tabContainer.ensureTabPreviewPanelLoaded();
    this.originalPreviewPanelActivate = gBrowser.tabContainer.previewPanel.activate;

    gBrowser.tabContainer.previewPanel.activate = async function(tabOrGroup) {

      try {

        if (gBrowser.isTab(tabOrGroup)) {
          if (tabOrGroup.hasAttribute("twisted-root") || tabOrGroup.hasAttribute("nestTab")) {
            function noteHover() {
              tabOrGroup.removeEventListener("TabNoteIconHoverStart", noteHover);
              gBrowser.tabContainer.previewPanel.deactivate(null, {
                force: true
              });
              popup.hidePopup();
            }
            tabOrGroup.addEventListener("TabNoteIconHoverStart", noteHover);
            let popup = document.getElementById("preview-collapsed-tree");
            popup.hidePopup();
            let menuMainDiv = popup.querySelector(".popup-main-panel");
            while (menuMainDiv.childNodes.length > 0) {
              menuMainDiv.removeChild(menuMainDiv.lastChild);
            }
            if (tabOrGroup.hasAttribute("twisted-root")) {
              let nextTab = (tabOrGroup.splitview) ? getNextTab(tabOrGroup.splitview) : getNextTab(tabOrGroup);
              let rootDepth = getTreeDepth(tabOrGroup);
              while (nextTab && getTreeDepth(nextTab) > rootDepth) {
                if (!nextTab.hasAttribute("nestTab")) {
                  let item = document.createXULElement("toolbarbutton");
                  let img = nextTab.querySelector(".tab-icon-image");
                  if (img) {
                    img = img.src;
                  }
                  let itemTab = nextTab;
                  item.setAttribute("image", img);
                  item.setAttribute("label", nextTab.label);
                  item.setAttribute("class", "tab-preview-item subviewbutton subviewbutton-iconic group-preview-button");
                  item.addEventListener("click", (aEvent) => {
                    if (window.gBrowser.tabs.includes(itemTab))
                      window.gBrowser.selectedTab = itemTab;
                  })
                  menuMainDiv.appendChild(item);
                }
                nextTab = getNextTab(nextTab);
              }
              if (tabOrGroup.splitview)
                popup.openPopup(tabOrGroup,
                  SidebarController._positionStart ? "topright topleft" : "topleft topright", 0, 3, false, false);
              else
                popup.openPopup(tabOrGroup,
                  SidebarController._positionStart ? "topright topleft" : "topleft topright", 0, 3, false, false);

              function hidePreviewPopup() {
                tabOrGroup.removeEventListener("TabNoteIconHoverStart", noteHover);
                popup.hidePopup();
              }

              function addHideOnMouseOut() {
                popup.removeEventListener("mouseover", addHideOnMouseOut);
                popup.addEventListener("mouseleave", hidePreviewPopup);
              }

              function mousoverElement(e) {
                let t = e.target;
                let popupTarget = t.closest("panel");
                let tab = t.closest("tab");
                let splitter = t.closest("splitter");
                if (popupTarget != popup && tab != tabOrGroup && splitter == null) {
                  hidePreviewPopup();
                }
              }

              window.addEventListener("mouseover", mousoverElement);
              window.addEventListener("TabSelect", hidePreviewPopup);
              nextTab.addEventListener("mouseout", hidePreviewPopup);
              popup.addEventListener("mouseover", addHideOnMouseOut);

              popup.addEventListener("popuphiding", function(aEvent) {
                window.removeEventListener("mouseover", mousoverElement);
                window.removeEventListener("TabSelect", hidePreviewPopup);
                popup.removeEventListener("mouseover", addHideOnMouseOut);
                nextTab.removeEventListener("mouseout", hidePreviewPopup);
                popup.removeEventListener("mouseleave", hidePreviewPopup);
              });

              nativeTreeTabs.originalPreviewPanelActivate.apply(this, arguments);

            }
            return;
          }
          //bugfix of og firefox (tries to show preview with documentHeight:0 )
          //useful for nest tabs that are empty
          if (tabOrGroup.linkedBrowser && tabOrGroup.linkedBrowser.browsingContext && tabOrGroup.linkedBrowser.browsingContext.currentWindowGlobal) {
            let actor = tabOrGroup.linkedBrowser.browsingContext.currentWindowGlobal.getActor("Thumbnails");
            if (actor) {
              let contentInfo = actor.sendQuery(
                "Browser:Thumbnail:ContentInfo"
              );
              if (contentInfo && contentInfo.documentHeight == 0) {
                return;
              }
            }
          }
        }
        popup.hidePopup();
        nativeTreeTabs.originalPreviewPanelActivate.apply(this, arguments);
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalPreviewPanelActivate.apply(this, arguments);
        return;
      }
    }

    gBrowser.tabContainer.ensureTabPreviewPanelLoaded();
    this.originalPreviewPanelDeactivate = gBrowser.tabContainer.previewPanel.deactivate;
    gBrowser.tabContainer.previewPanel.deactivate = function(tabOrGroup) {
      try {
        // popup.hidePopup();
        // Services.focus.activeWindow;
        nativeTreeTabs.originalPreviewPanelDeactivate.apply(this, arguments);
      } catch (error) {
        console.error(error);
        nativeTreeTabs.originalPreviewPanelDeactivate.apply(this, arguments);
        return;
      }
    }
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
      if (cTab.splitViewId != null) {
        cTab.tabs.forEach((splittab) => setPanel(splittab, panel, window));
      } else {
        setPanel(cTab, panel, window);
      }
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
        if (cTab.hasAttribute("nestMove")) {
          cTab.removeAttribute("nestMove");
        } else {
          setTreeDepth(cTab, 0);
          removeOpener(cTab);
        }
      }
      if (!group && cTab.hasAttribute("twisted-root")) {
        let twistedDepth = getTreeDepth(cTab);
        let nextTab = getNextTab(cTab);
        let depthFix = getTreeDepth(nextTab);
        while (nextTab) {
          //Add hidden children
          if (nextTab.hasAttribute("hidden-child")) {
            let newDepth = twistedDepth + 1 + depthFix - getTreeDepth(nextTab);
            setTreeDepth(nextTab, newDepth);
          } else {
            break;
          }
          nextTab = getNextTab(nextTab);
        }
      }
      removeSkipNextMoveCheck(cTab);
    }, this);
  },

  prepareTabsForPanelMove: function(tabs, group = false) {

    let splitViewsFound = new Array();

    tabs.forEach(function(cTab, index) {
      //replaces split view childnodes with their splitview itself
      if (cTab.splitview) {
        if (!splitViewsFound.includes(cTab.splitview)) {
          tabs.splice(index, 1, cTab.splitview);
          splitViewsFound.push(cTab.splitview);
        } else {
          tabs.splice(index, 1);
        }
      }
    });

    let newArray = tabs.slice();

    tabs.forEach(function(cTab, index) {
      let previousTab = getPreviousTab(cTab);
      if (previousTab && previousTab.hasAttribute("nestTab")) {
        if (!tabs.includes(previousTab)) {
          //search if whole nest moves
          let dontInclude = false;
          let nestDirect = cTab;
          let nestDepth = getTreeDepth(nestDirect);
          while (isTab(nestDirect)) {
            let nestDirectDepth = getTreeDepth(nestDirect);
            if (nestDirectDepth && nestDirectDepth <= nestDepth) {
              break;
            }
            if (nestDirectDepth == nestDepth + 1 && !tabs.includes(nestDirect)) {
              dontInclude = true;
              break;
            }
            nestDirect = getNextTab(nestDirect);
          }
          if (dontInclude == false) {
            //add whole nest tab
            skipNextMoveCheck(previousTab);
            newArray.splice(index + (newArray.length - tabs.length), 0, previousTab);
          }
        }
      }
    });

    tabs = newArray.slice();

    tabs.forEach(function(cTab, index) {
      if (cTab.hasAttribute("nestTab")) {
        let cTabtreeDepth = getTreeDepth(cTab);
        let nextTab = getNextTab(cTab);
        let plusIndex = 0;
        while (nextTab) {
          //Add hidden children
          if (getTreeDepth(nextTab) > cTabtreeDepth) {
            if (!tabs.includes(nextTab)) {
              newArray.splice(index + plusIndex + 1 + (newArray.length - tabs.length), 0, nextTab);
              nextTab.setAttribute("nestMove", "true");
              skipNextMoveCheck(nextTab);
            }
          } else {
            break;
          }
          plusIndex++;
          nextTab = getNextTab(nextTab);
        }
      }
    });
    tabs = newArray.slice();

    tabs.forEach(function(cTab, index) {
      if (cTab.hasAttribute("twisted-root") || (cTab.splitViewId && cTab.tabs[0].hasAttribute("twisted-root"))) {
        let cTabtreeDepth = getTreeDepth(cTab);
        let nextTab = getNextTab(cTab);
        while (nextTab) {
          //Add hidden children
          if (nextTab.hasAttribute("hidden-child")) {
            if (!tabs.includes(nextTab)) {
              newArray.splice(index + 1 + (newArray.length - tabs.length), 0, nextTab);
              skipNextMoveCheck(nextTab);
            }
          } else {
            break;
          }
          nextTab = getNextTab(nextTab);
        }
      }
      if (!group) {
        let root = getRootTab(cTab);
        while (isTab(root)) {
          if (tabs.includes(root) || (root.splitview && tabs.includes(root.splitview))) {
            if (root.splitview) {
              root = root.splitview;
            }
            let rootlDepth = (root.hasAttribute("new-tree-depth")) ? root.getAttribute("new-tree-depth") : 0;
            cTab.setAttribute("new-tree-depth", parseInt(rootlDepth, 10) + 1);
            cTab.setAttribute("new-tree-parent", root.getAttribute("tree-id"));
            break;
          }
          root = getRootTab(root);
        }
        skipNextMoveCheck(cTab);
      }
    }, this);

    if (!group) {
      tabs.slice().reverse().forEach(function(cTab, index) {
        if (!cTab.hasAttribute("twisted-root") && !cTab.hasAttribute("hidden-child") && !cTab.hasAttribute("nestTab") && !cTab.hasAttribute("nestMove")) {
          if (cTab.splitViewId) {
            cTab.tabs.forEach(function(sTab) {
              this.tabLeaveStrip(sTab);
            }, this);
          }
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
      "label": this.defaultPanelName.value,
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
      if (tabs.includes(window.gBrowser.selectedTab) ||
        (window.gBrowser.selectedTab.splitview && tabs.includes(window.gBrowser.selectedTab.splitview))) {
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
          if (cTab.splitViewId != null) {
            cTab.tabs.forEach((splittab) => unHideTab(splittab));
          } else
            unHideTab(cTab);
        } else {
          if (cTab.splitViewId != null) {
            cTab.tabs.forEach((splittab) => hideTab(splittab));
          } else
            hideTab(cTab);
        }
      }, this);
      if (show) {
        if (saveSelectedTab != null) {
          window.gBrowser.selectedTab = saveSelectedTab;
        }
        if (tabs.includes(window.gBrowser.selectedTab) ||
          (window.gBrowser.selectedTab.splitview && tabs.includes(window.gBrowser.selectedTab.splitview))) {
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

    function splitviewsToTabs(tabsArray) {
      let newArray = new Array();
      tabsArray.forEach(function(t) {
        if (t.splitViewId) {
          newArray.push(...t.tabs);
        } else
          newArray.push(t);
      });
      return newArray;
    }
    for (const aTab of tabs) {
      let skip = false;
      if (aTab.group) {
        if (!addedGroups.has(aTab.group.id)) {
          if (!checkedGroups.has(aTab.group.id) && includesAll(splitviewsToTabs(tabs), aTab.group.tabs)) {
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
          while (position == null && indexOfBeforePanel > 0) {
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
              //tabs already in correct position only array is wrong
              let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
              moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, indexOfBeforePanel);
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
          skipNextMoveCheck(aTab);
        }
      }
    }, this);

    //Change panel position in panel array and move tabs
    //Also fix position in tab ContextMenu panel move menu  
    let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
    let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
    let contextItem = tabContextMenupopup.querySelector('#moveTo-panel-' + panel.id.toString());

    if (position != null) {
      indexOfBeforePanel = nativeTreeTabs.tabPanels.indexOf(beforePanel);
      //downwards move
      if (indexOfBeforePanel > indexOfPanel) {
        indexOfBeforePanel = indexOfBeforePanel - 1;
      }
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, indexOfBeforePanel);
      let prevItemContext = tabContextMenupopup.querySelector('#moveTo-panel-' + beforePanelId.toString());
      if (tabContextMenupopup && contextItem && prevItemContext) {
        tabContextMenupopup.insertBefore(contextItem, prevItemContext);
      }
      if (position != null && tabsToMove.length != 0) {
        if (afterMove == false) {
          nativeTreeTabs.moveTabsBefore(tabsToMove, position);
        } else {
          nativeTreeTabs.moveTabsAfter(tabsToMove, position);
        }
      }
    } else {
      let lastIndex = nativeTreeTabs.tabPanels.length - 1;
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, lastIndex);
      if (tabContextMenupopup && contextItem) {
        tabContextMenupopup.lastChild.after(contextItem);
      }
      if (tabsToMove.length != 0) {
        nativeTreeTabs.moveTabsAfter(tabsToMove, gBrowser.tabs[gBrowser.tabs.length - 1]);
      }
    }
    tabsToMove.forEach(function(cTab) {
      removeSkipNextMoveCheck(cTab);
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
    if (lastTab.hasAttribute("panel-id") && lastTab.getAttribute("panel-id") === panelId) {
      previousTab = lastTab;
    } else {
      previousTab = gBrowser.tabContainer.findNextTab(lastTab, {
        direction: -1,
        wrap: true,
        filter: tab => tab.hasAttribute("panel-id") && tab.getAttribute("panel-id") === panelId,
      });
    }
    if (previousTab != null) {

      tabsToMove = this.prepareTabsForPanelMove(tabsToMove, group);
      //Force select the new panel when switching
      // if the selected tab is set to move
      // Check before setting the panel, because 
      // the selected tab might change (if the panel closes)
      let saveSelectedTab;
      if (tabsToMove.includes(gBrowser.selectedTab) ||
        (window.gBrowser.selectedTab.splitview && tabsToMove.includes(window.gBrowser.selectedTab.splitview))) {
        saveSelectedTab = gBrowser.selectedTab;
      }
      try {
        nativeTreeTabs.moveTabsAfter(tabsToMove, previousTab);
      } catch (error) {
        console.error(error)
      }
      this.afterTabsForPanelMove(tabsToMove, panel, group);
      if (saveSelectedTab != null) {
        gBrowser.selectedTab = saveSelectedTab;
      }
      if (forceShow || tabsToMove.includes(window.gBrowser.selectedTab) ||
        (window.gBrowser.selectedTab.splitview && tabsToMove.includes(window.gBrowser.selectedTab.splitview))) {
        this.tabPanelShow(panel, changeSelectedTab = false);
        if (!tabsToMove.includes(gBrowser.selectedTab)) {
          gBrowser.selectedTabs = tabsToMove[0];
          gBrowser.selectedTab = tabsToMove[0];
        } else {
          window.gBrowser.selectedTabs = window.gBrowser.selectedTab;
        }
      } else {
        tabsToMove.forEach(function(cTab) {
          if (cTab.splitViewId != null) {
            cTab.tabs.forEach((splittab) => hideTab(splittab));
          } else
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
        setCustomTabValue(aTab, "panel-label", panel.label);
      }
    }, this);
    if (panelId === "0") {
      Services.prefs.setStringPref("treeTabs.defaultPanelName.value", label);
    }
  },

  changeSelectedPanel: function(panel) {
    let panelId = panel.id.toString();
    if (this.selectedtPanel.id.toString() === panelId) {
      this.selectedtPanel.selectedTab = gBrowser.selectedTab;
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
    let splitViewsFound = new Array();
    tabs.forEach(function(aTab) {
      if (aTab.pinned || aTab.hasAttribute("tabPanel-hidden")) {
        return;
      }
      if (aTab.splitview) {
        aTab = aTab.splitview;
        if (splitViewsFound.includes(aTab)) {
          return;
        }
        splitViewsFound.push(aTab);
      }
      let rootTab = getRootTab(aTab);
      if (rootTab && multiSelected(rootTab)) {
        return;
      }
      // let aTab = window.gBrowser.selectedTab;
      let treeDepth = getTreeDepth(aTab);
      let previousTab = aTab.previousSibling;
      if (previousTab && previousTab.splitViewId)
        previousTab = previousTab.tabs[0];
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
        let nextTab = getNextTab(getLastInTree(aTab));

        if (nextTab && !nextTab.hasAttribute("tabPanel-hidden")) {
          let nextTabDepth = getTreeDepth(nextTab);
          if (treeDepth == nextTabDepth && !multiSelected(nextTab)) {
            return;
          }
        }
        if (treeDepth > 0) {
          if (previousTab.hasAttribute("nestTab")) {
            gBrowser.removeTab(previousTab);
          }
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
    let nestChecked = new Array();
    let nestsToMove = new Array();
    let splitViewsFound = new Array();

    window.gBrowser.selectedTabs.forEach(function(aTab) {
      if (aTab.hasAttribute("moving-by-key")) {
        return;
      }
      let groupPush = false;
      let nestPush = false;

      if (aTab.splitview) {
        //replaces split view childnodes with their splitview itself
        if (!splitViewsFound.includes(aTab.splitview)) {
          aTab = (aTab.splitview);
          splitViewsFound.push(aTab.splitview);
        } else {
          return;
        }
      }

      if (aTab.group) {
        if (!groupsChecked.includes(aTab.group)) {
          if (checkGroupRoots(aTab)) {
            groupsToMove.push(aTab.group);
            moveAll = true;
            tabsToMove.push(aTab.group);
          } else {
            groupPush = true;
          }
          groupsChecked.push(aTab.group);
        } else if (!groupsToMove.includes(aTab.group)) {
          groupPush = true;
        }
      } else {
        groupPush = true;
      }

      let nest = inNest(aTab);

      if (nest != null) {
        if (!nestChecked.includes(nest)) {
          if (checkNest(nest, window.gBrowser.selectedTabs)) {
            nestsToMove.push(nest);
            tabsToMove.push(nest);
          } else {
            nestPush = true;
          }
          nestChecked.push(nest);
        } else if (!nestsToMove.includes(nest)) {
          nestPush = true;
        }
      } else {
        nestPush = true;
      }

      if (nestPush && groupPush) {
        tabsToMove.push(aTab);
      }

      if (aTab.splitViewId != null) {
        aTab.tabs.forEach((t) => t.setAttribute("moving-by-key", "true"));
      } else {
        aTab.setAttribute("moving-by-key", "true");
      }
      let aTabDepth = getTreeDepth(aTab);
      let nextTab = getNextTab(aTab);
      while (isTab(nextTab)) {
        let nextTabDepth = getTreeDepth(nextTab);
        if (nextTabDepth != null && nextTabDepth <= aTabDepth) {
          break;
        }
        nextTab.setAttribute("moving-by-key", "true");
        nextTab = getNextTab(nextTab);
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
        let prevPosition = getPosition(aTab);
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
                  skipNextMoveCheck(tab);
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
                  skipNextMoveCheck(tab);
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
          nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), aTabDepth, groupState = false, forceMultiselected = true);
        } else {
          aTab.tabs.forEach(function(tab) {
            removeSkipNextMoveCheck(tab);
          }, this);
        }
        return;
      }

      if (dir === "up") {
        //move down or stick
        if (getPosition(aTab) > 0 || aTab.group) {
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
              let prevPosition = getPosition(aTab);
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
              } else if (previousTabDepth != null) {
                //special case if moving under tree
                setTreeDepth(aTab, previousTabDepth);
                copyOpener(aTab, previousTab);
              }
              // removeSkipNextMoveCheck(aTab);
              if (nextTabDepth && nextTabDepth > aTabDepth) {
                setTreeDepth(nextTab, nextTabDepth);
              }
              // aTabDepth aTabDepth = getTreeDepth(aTab);
              nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), aTabDepth, groupState = false, forceMultiselected = true);
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
            let prevPosition = getPosition(aTab);
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
            nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), aTabDepth, groupState = false, forceMultiselected = true);
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
            let prevPosition = getPosition(aTab);
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
            // removeSkipNextMoveCheck(aTab);
            if (trueNextTabDepth && trueNextTabDepth > aTabDepth) {
              setTreeDepth(trueNextTab, trueNextTabDepth);
            }
            // aTabDepth = getTreeDepth(aTab);
            nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), aTabDepth, groupState = false, forceMultiselected = true);
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
          let prevPosition = getPosition(aTab);
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
          nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), aTabDepth, groupState = false, forceMultiselected = true);
          return
        }
      }
    });
    window.gBrowser.selectedTabs.forEach(function(aTab) {
      if (!aTab.hasAttribute("moving-by-key"))
        return;

      if (aTab.splitview) {
        aTab = aTab.splitview;
      }
      if (aTab.splitViewId) {
        aTab.tabs.forEach((t) => t.removeAttribute("moving-by-key"));
      } else {
        if (!aTab.hasAttribute("moving-by-key"))
          return;
        aTab.removeAttribute("moving-by-key");
      }

      let aTabDepth = getTreeDepth(aTab);
      let nextTab = getNextTab(aTab);
      while (isTab(nextTab)) {
        let nextTabDepth = getTreeDepth(nextTab);
        if (nextTabDepth != null && nextTabDepth <= aTabDepth) {
          break;
        }
        nextTab.removeAttribute("moving-by-key");
        nextTab = getNextTab(nextTab);
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
  //use tabposition?
  if (aTab == null) {
    return;
  }

  let nextTab = aTab.nextSibling;

  if (aTab.splitview) {
    if (aTab.splitview.tabs.indexOf(aTab) === 1) {
      nextTab = aTab.splitview.nextSibling;
    }
  }

  if (aTab.group) {
    if (aTab.group.tabs.indexOf(aTab) === aTab.group.tabs.length - 1) {
      nextTab = aTab.group.nextSibling;
    }
  }

  if (nextTab && nextTab.tagName === "tab-group") {
    nextTab = nextTab.tabs[0];
  }

  if (nextTab && nextTab.splitViewId) return nextTab.tabs[0];
  if (!isTab(nextTab)) return null;
  return nextTab;
}

getPreviousTab = function(aTab) {

  if (aTab == null) {
    return;
  }
  let previousTab = aTab.previousSibling;

  if (aTab.splitview) {
    if (aTab.splitview.tabs.indexOf(aTab) === 0) {
      previousTab = aTab.splitview.previousSibling;
    }
  }

  if (aTab.group) {
    if (aTab.group.tabs.indexOf(aTab) === 0) {
      previousTab = aTab.group.previousSibling;
    }
  }

  if (previousTab && previousTab.tagName === "tab-group") {
    previousTab = previousTab.tabs[previousTab.tabs.length - 1];
  }

  if (previousTab && previousTab.splitViewId) return previousTab.tabs[1];
  if (!isTab(previousTab)) return null;
  return previousTab;
}

setCustomTabValue = function(aTab, valueName, value) {
  if (aTab.splitViewId == null) {
    SessionStore.setCustomTabValue(aTab, valueName, value);
  } else {
    aTab.tabs.forEach((tab) => setCustomTabValue(tab, valueName, value));
  }
}

deleteCustomTabValue = function(aTab, valueName) {
  if (aTab.splitViewId == null) {
    SessionStore.deleteCustomTabValue(aTab, valueName);
  } else {
    aTab.tabs.forEach((tab) => deleteCustomTabValue(tab, valueName));
  }
}

getCustomTabValue = function(aTab, valueName) {
  if (aTab.splitViewId != null) {
    aTab = aTab.tabs[0];
  }
  return SessionStore.getCustomTabValue(aTab, valueName);
}


getPosition = function(aTab) {
  if (aTab.splitViewId == null) {
    return aTab._tPos;
  }
  return aTab.tabs[0]._tPos;
}

skipNextMoveCheck = function(aTab) {
  if (aTab.splitViewId != null) {
    aTab.tabs.forEach(function(sTab) {
      sTab.setAttribute("skipMoveForced", "true")
    });
  } else {
    aTab.setAttribute("skipMoveForced", "true");
  }
}
//([^\s]+)\.removeAttribute\("skipMoveForced"\)
removeSkipNextMoveCheck = function(aTab) {
  if (aTab.splitViewId != null)
    aTab.tabs.forEach(function(sTab) {
      sTab.removeAttribute("skipMoveForced")
    });
  else
    aTab.removeAttribute("skipMoveForced");
}

setTabTreeID = function(aTab, id) {
  window.nativeTreeTabs.tabsIds.set(id, aTab);
  id = id.toString();
  aTab.setAttribute("tree-id", id);
  setCustomTabValue(aTab, "tree-id", id);
}

setTreeDepth = function(aTab, depth) {
  depth = depth.toString();
  if (aTab.splitViewId == null) {
    aTab.setAttribute("tree-depth", depth);
    setCustomTabValue(aTab, "tree-depth", depth);
  } else {
    aTab.tabs[0].setAttribute("tree-depth", depth);
    setCustomTabValue(aTab.tabs[0], "tree-depth", depth);
    aTab.tabs[1].setAttribute("tree-depth", depth);
    setCustomTabValue(aTab.tabs[1], "tree-depth", depth);
  }
}

getTreeDepth = function(aTab) {
  if (aTab.splitViewId != null) {
    aTab = aTab.tabs[0];
  }
  let depthLevel = aTab.getAttribute("tree-depth");
  if (depthLevel != null) {
    return parseInt(depthLevel, 10);
  }
  return null;
}
hasTreeDepth = function(aTab) {
  if (aTab.splitViewId != null) {
    aTab = aTab.tabs[0];
  }
  return aTab.hasAttribute("tree-depth");
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

  setCustomTabValue(aTab, "panel-id", panelId);
  setCustomTabValue(aTab, "panel-label", panel.label.toString());

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
      setCustomTabValue(cTab, "tabPanel-hidden", "true");
    });
    if (!aTab.group.hasAttribute("save-state-collapsed"))
      aTab.group.setAttribute("save-state-collapsed", aTab.group.collapsed.toString());
    aTab.group.collapsed = true;
  } else {
    aTab.setAttribute("tabPanel-hidden", true);
    setCustomTabValue(aTab, "tabPanel-hidden", "true");
  }
}

unHideTab = function(aTab, panelId) {
  if (aTab.group) {
    aTab.group.tabs.forEach(function(cTab) {
      cTab.removeAttribute("tabPanel-hidden");
      deleteCustomTabValue(cTab, "tabPanel-hidden");
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
    deleteCustomTabValue(aTab, "tabPanel-hidden");
  }
}
setOpener = function(aTab, openerTab) {
  if (openerTab == null) {
    removeOpener(aTab);
    return;
  }
  let openerId = openerTab.getAttribute("tree-id");
  if (openerId) {
    if (aTab.splitViewId == null) {
      aTab.openerTab = openerTab;
      setCustomTabValue(aTab, "opener-id", openerId.toString());
      aTab.setAttribute("opener-id", openerId);
    } else {
      aTab.tabs.forEach((tab) => setOpener(tab, openerTab));
    }
  }
}

copyOpener = function(aTab, originTab) {
  if (originTab == null) return;
  let openerId = originTab.getAttribute("opener-id");
  if (openerId) {
    //Why not use setOpener Here?
    //In case of openerTab and  opener-id mismatch?
    if (aTab.splitViewId == null) {
      aTab.openerTab = originTab.openerTab;
      setCustomTabValue(aTab, "opener-id", openerId.toString());
      aTab.setAttribute("opener-id", openerId);
    } else {
      aTab.tabs.forEach((tab) => copyOpener(tab, originTab));
    }
  } else {
    removeOpener(aTab);
  }
}

removeOpener = function(aTab) {
  if (aTab.splitViewId == null) {
    aTab.openerTab = null;
    aTab.removeAttribute("opener-id");
    deleteCustomTabValue(aTab, "opener-id");
  } else {
    aTab.tabs.forEach(removeOpener);
  }
}
multiSelected = function(aTab) {
  if (aTab.splitview && aTab.splitview.tabs.length > 1) {
    aTab = aTab.splitview;
  }
  if (aTab.splitViewId == null) {
    return aTab.multiselected;
  }
  if (aTab.tabs.length == 1)
    return aTab.tabs[0].multiselected;
  return (aTab.tabs[0].multiselected || aTab.tabs[1].multiselected)
}

isHiddenChild = function(aTab) {
  if (aTab.splitViewId == null) {
    if (aTab.hasAttribute("hidden-child"))
      return true;
    return false;
  } else return isHidden(aTab.tabs[0]);
}
isHidden = function(aTab) {
  if (aTab.splitViewId == null) {
    if (aTab.hasAttribute("hidden-child") || aTab.hasAttribute("tabPanel-hidden"))
      return true;
    return false;
  } else return isHidden(aTab.tabs[0]);
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
  if ((aTab.hasAttribute("hidden-child") && nativeTreeTabs.hopOverCollapsedTabs.value) || aTab.hasAttribute("nestTab")) {
    return false;
  }
  return aTab.visible;
}

unloadedCheck = function(aTab) {
  if (nativeTreeTabs.hopOverUnloadedTabs.value == false)
    return true;
  if ((!aTab.linkedPanel && nativeTreeTabs.hopOverCollapsedTabsIncludeRestoredTabs.value) || aTab.hasAttribute("discarded"))
    return false;
  return true;
}

increaseChildCount = function(aTab) {
  let root = getRootTab(aTab);
  while (isTab(root) && (!root.hasAttribute("twisted-root"))) {
    root = getRootTab(root);
    if (root && root.splitview) {
      root = root.splitview.firstChild;
    }
  }
  if (!isTab(root) || (!root.hasAttribute("twisted-root"))) {
    return;
  }
  restoreCount(root);
}

restoreCount = function(aTab) {
  let hiddenChild = (aTab.splitview) ? getNextTab(aTab.splitview) : getNextTab(aTab);
  let aTabDepth = getTreeDepth(aTab);
  let count = 0;
  while (hiddenChild) {
    let hiddenChildDepth = getTreeDepth(hiddenChild);
    if (hiddenChildDepth == null || hiddenChildDepth <= aTabDepth) {
      break;
    }
    if (!hiddenChild.hasAttribute("nestTab"))
      count++;
    hiddenChild = getNextTab(hiddenChild);
  }
  addTabChildCount(aTab, count);
}

addTabChildCount = function(aTab, count, unhide = false) {
  let tabChildCount = aTab.querySelector(".tab-child-count");
  let tabChildCount2 = aTab.querySelector(".tab-child-count2");

  if (tabChildCount == null) {
    tabChildCount = document.createElement("label");
    tabChildCount.setAttribute("class", "tab-child-count tab-text");
    tabChildCount2 = document.createElement("label");
    tabChildCount2.setAttribute("class", "tab-child-count2 tab-text");
    let tabIcon = aTab.querySelector(".tab-icon-image");
    tabIcon.after(tabChildCount);
    let tabLabel = aTab.querySelector(".tab-note-icon");
    tabLabel.parentNode.insertBefore(tabChildCount2, tabLabel);
    // let tabLabel = aTab.querySelector(".tab-label");
    // tabLabel.after(tabChildCount);
    // tabLabel.parentNode.style.flexDirection = "row";
  }
  // if (unhide && !aTab.hasAttribute("nestTab")) {
  //maybe add an option to awlays show on nesttab
  ///(would need general update when a new child is added)
  if (unhide) {
    tabChildCount.remove();
    tabChildCount2.remove();
  } else {
    tabChildCount.textContent = "(" + count + ")";
    tabChildCount2.textContent = "(" + count + ")";
  }
}

setDomainAttr = function(aTab) {
  if (!isTab(aTab)) return;
  let linkedBrowser = aTab.linkedBrowser;
  if (linkedBrowser == null) return;
  let uri = aTab.linkedBrowser.currentURI;
  let spec = uri.spec;
  let bakedPatterns = ["about", "resource", "chrome", "wyciwyg", "file", "blob", "moz-extension", "jar", "moz-icon"];
  let baked = bakedPatterns.some(p => spec.startsWith(p));
  try {
    //BrowserUtils.formatURIForDisplay(uri));
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

function checkNest(nestTab, tabs) {
  if (!isTab(nestTab)) {
    return false;
  }
  let nextTab = getNextTab(nestTab);
  let nestTabDepth = getTreeDepth(nestTab);
  let tabLeft = false;
  while (nextTab) {
    let nextTabTreeDepth = getTreeDepth(nextTab);
    if (nextTabTreeDepth != null && nextTabTreeDepth <= nestTabDepth) {
      break;
    }
    if (nextTabTreeDepth == nestTabDepth + 1 && !tabs.includes(nextTab)) {
      tabLeft = true;
      break;
    }
    nextTab = getNextTab(nextTab);
  }
  if (tabLeft == false) {
    return true;
  }
  return false;
}

function inNest(aTab) {
  if (aTab.splitViewId) {
    aTab = aTab.tabs[0];
  }
  if (!isTab(aTab)) {
    return null;
  }
  let root = getRootTab(aTab)
  while (root) {
    if (root.hasAttribute("nestTab")) {
      return root;
    }
    root = getRootTab(root)
  }
  return null;
}

function checkGroupRoots(aTab) {
  if (!aTab.group) {
    return false;
  }
  let allIn = aTab.group.tabs.find(x => getTreeDepth(x) == 0 && (!multiSelected(x) && !x.selected));
  if (allIn == null) {
    return true;
  }
  return false;
}
/*==============================*/
/*       Tree functions         */
/*==============================*/
getPositionUnderRoot = function(rootTab) {
  let newPosition = getPosition(rootTab) + 1;
  return newPosition;
}

getClosestZeroDepthTab = function(aTab, direction, skipSplitViews = true) {
  let getFollowingTab = (direction == "up") ? getNextTab : getPreviousTab;
  let followingTab = getFollowingTab(aTab);
  while (followingTab != null) {
    if (followingTab.splitview && skipSplitViews) {} else {
      followingTabTreeDepth = getTreeDepth(followingTab);
      if (followingTabTreeDepth == null || followingTabTreeDepth == 0) {
        return followingTab;
      }
    }
    followingTab = getFollowingTab(followingTab);
  }
  return null;
}
getRootTab = function(aTab) {
  if (aTab.splitview) {
    aTab = aTab.splitview;
  }
  let aTabDepth = getTreeDepth(aTab);
  if (aTabDepth == 0) return null;
  let previousTab = getPreviousTab(aTab);
  while (isTab(previousTab)) {
    if (getTreeDepth(previousTab) < aTabDepth) {
      return previousTab;
    }
    previousTab = getPreviousTab(previousTab);
  }
  return null;
}
getTreeRoot = function(aTab) {
  let root = aTab;
  while (isTab(root)) {
    let rootDepth = getTreeDepth(root);
    if (rootDepth == 0)
      return root;
    root = getRootTab(root);
  }
  return null;
}

function checkIfIsAncestor(aTab, possibleRoot) {
  if (getTreeDepth(possibleRoot) >= getTreeDepth(aTab))
    return false;
  if (possibleRoot.splitview && possibleRoot.splitview.tabs.length > 1) {
    possibleRoot = possibleRoot.splitview.tabs[1];
  }
  let isAncestor = false;
  let root = getRootTab(aTab);
  while (isTab(root)) {
    if (root == possibleRoot) {
      isAncestor = true;
      break;
    }
    root = getRootTab(root);
  }
  return isAncestor;
}

getLastInTree = function(aTab) {
  if (aTab.splitview) {
    aTab = aTab.splitview;
  }
  let aTabDepth = getTreeDepth(aTab);
  let nextTab = getNextTab(aTab);
  let toReturn = aTab;
  while (isTab(nextTab)) {
    if (getTreeDepth(nextTab) > aTabDepth) {
      toReturn = nextTab;
      nextTab = getNextTab(nextTab);
    } else {
      break;
    }
  }
  return toReturn;
}

removeTreeOutline = function(index, aTab) {
  if (aTab.splitViewId != null) {
    index = index + 2;
  }
  let nextTab = gBrowser.tabs[index];
  let count = 0;
  while (nextTab) {
    let outlineStyle = nextTab.querySelector(".tab-background");
    if (outlineStyle == null) return count;
    outlineStyle = outlineStyle.style.outline.toString();
    if (nextTab != aTab && (outlineStyle != "red solid 1px")) break;
    nextTab.querySelector(".tab-background").style.outline = "";
    count = count++;
    nextTab = getNextTab(nextTab);
  }
  return count;
}

outlineTree = function(aTab, outlineToggle) {
  if (aTab.splitview)
    aTab = aTab.splitview;

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
    while (isTab(nextTab) && multiSelected(nextTab)) {
      nextTab = getNextTab(nextTab);
      if (!isTab(nextTab)) return true;
    }
    nextTabTreeDepth = getTreeDepth(nextTab);
    if (rootTab != nextTab) {
      if (nextTabTreeDepth == null || nextTabTreeDepth <= rootlDepth) {
        break;
      }
    }
    if (multiSelected(rootTab))
      toCheck = nextTab;
    else
      //previous tab is used because 
      //moving at the end of the tree is allowed
      toCheck = getPreviousTab(nextTab);;
    if (toCheck === rootTab) {
      return false;
    }
    nextTab = getNextTab(nextTab);
  }
  return true;
}
//_________________

function getPrefBranch() {
  return Services.prefs.getBranch(null);
}

function setPref(prefName, value) {
  try {
    var prefBranch = getPrefBranch();
    if (typeof value == "string") {
      // if (gIsUTF8) {
      //   prefBranch.setStringPref(prefName, value);
      //   return;
      // }
      prefBranch.setStringPref(prefName, value);
    } else if (typeof value == "number") {
      prefBranch.setIntPref(prefName, value);
    } else if (typeof value == "boolean") {
      prefBranch.setBoolPref(prefName, value);
    }
  } catch (e) {
    displayError("pref", e);
  }
}

function getPref(prefName) {
  var prefBranch = getPrefBranch();

  switch (prefBranch.getPrefType(prefName)) {
    case prefBranch.PREF_STRING:
      // if (gIsUTF8) {
      //   return prefBranch.getStringPref(prefName);
      // }
      return prefBranch.getStringPref(prefName);
    case prefBranch.PREF_INT:
      return prefBranch.getIntPref(prefName);
    case prefBranch.PREF_BOOL:
      return prefBranch.getBoolPref(prefName);
    default:
      return null;
  }
}

function clearUserPref(prefName) {
  try {
    var prefBranch = getPrefBranch();
    prefBranch.clearUserPref(prefName);
  } catch (e) {
    displayError("pref", e);
  }
}

function parseShortcut(str) {
  //input string (example: "Ctrl + Shift + A")
  // returns object, with modifiers values plus keycode 
  const keyToCode = new Map([["a", 65], ["A", 65], ["b", 66], ["B", 66], ["c", 67], ["C", 67], ["d", 68], ["D", 68], ["e", 69], ["E", 69], ["f", 70], ["F", 70], ["g", 71], ["G", 71], ["h", 72], ["H", 72], ["i", 73], ["I", 73], ["j", 74], ["J", 74], ["k", 75], ["K", 75], ["l", 76], ["L", 76], ["m", 77], ["M", 77], ["n", 78], ["N", 78], ["o", 79], ["O", 79], ["p", 80], ["P", 80], ["q", 81], ["Q", 81], ["r", 82], ["R", 82], ["s", 83], ["S", 83], ["t", 84], ["T", 84], ["u", 85], ["U", 85], ["v", 86], ["V", 86], ["w", 87], ["W", 87], ["x", 88], ["X", 88], ["y", 89], ["Y", 89], ["z", 90], ["Z", 90], ["0", 48], ["1", 49], ["2", 50], ["3", 51], ["4", 52], ["5", 53], ["6", 54], ["7", 55], ["8", 56], ["9", 57], [".", 190], [",", 188], [";", 59], ["'", 222], ["[", 219], ["]", 221], ["\\", 220], ["/", 191], ["`", 192], ["-", 173], ["=", 61], ["Enter", 13], ["Tab", 9], ["Backspace", 8], ["Delete", 46], ["Escape", 27], ["Space", 32], ["ArrowUp", 38], ["ArrowDown", 40], ["ArrowLeft", 37], ["ArrowRight", 39], ["F1", 112], ["F2", 113], ["F3", 114], ["F4", 115], ["F5", 116], ["F6", 117], ["F7", 118], ["F8", 119], ["F9", 120], ["F10", 121], ["F11", 122], ["F12", 123], ["Numpad0", 96], ["Numpad1", 97], ["Numpad2", 98], ["Numpad3", 99], ["Numpad4", 100], ["Numpad5", 101], ["Numpad6", 102], ["Numpad7", 103], ["Numpad8", 104], ["Numpad9", 105], ["NumpadDecimal", 110], ["NumpadDivide", 111], ["NumpadMultiply", 106], ["NumpadSubtract", 109], ["NumpadAdd", 107], ["NumpadEnter", 13]]);
  const parts = str.replaceAll(' ', '').split("+");
  let key = parts.pop();
  key = keyToCode.get(key);

  return {
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    meta: parts.includes("Meta"),
    key: key
  };
}

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

function switchPanelOnScroll(enable) {
  function onScroll(aEvent) {
    //change selected panel on scroll
    let aDir = (aEvent.deltaY > 0) ? 1 : -1;
    let nextPanelId
    let nextPanelIndex;
    let startTabPanelIndex = nativeTreeTabs.tabPanels.indexOf(nativeTreeTabs.selectedtPanel);
    nativeTreeTabs.cycleTabPanels(aDir);
  }
  let tabPanelGroup = document.getElementById("tab-panels-group");
  if (tabPanelGroup == null) {
    return;
  }
  if (enable) {
    tabPanelGroup.addEventListener("wheel", onScroll);
  } else {
    tabPanelGroup.removeEventListener("wheel", onScroll);
  }
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

  let tabContextMenupopup = document.getElementById("tab-context-panel-actions");
  let contextItem = addMenuItem(tabContextMenupopup, "" + panel.label, (aTab, aEvent) => {
    let forceShow = (aEvent.ctrlKey) ? true : false;
    let tabs = (multiSelected(TabContextMenu.contextTab)) ?
      gBrowser.selectedTabs : [TabContextMenu.contextTab];
    window.nativeTreeTabs.moveTabsToPanel(tabs, panel, forceShow);
  }, isToggle = false, id = "moveTo-panel-" + panel.id.toString());

  if (menupopup) {
    if (position === -1) {
      menupopup.appendChild(menuitem);
    } else if (position == null) {
      //first place
      let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
      moveItemInTheArray(nativeTreeTabs.tabPanels, indexOfPanel, 0);
      menupopup.firstChild.after(menuitem);
      tabContextMenupopup.firstChild.after(contextItem);
    } else {
      let prevItem = menupopup.querySelector('[panel-id="' + position.toString() + '"]');
      if (prevItem) {
        //already added to tabPanels so indexes differ in the menu by + 1
        // no need to add it because menu first child is start button so indexes
        // of menu are +1 always
        // let itemIndex = Array.prototype.indexOf.call(menupopup.children, prevItem);
        // let indexOfPanel = nativeTreeTabs.tabPanels.indexOf(panel);
        prevItem.after(menuitem);

      } else {
        menupopup.appendChild(menuitem);
      }
      let prevItemContext = tabContextMenupopup.querySelector('#moveTo-panel-' + position.toString());
      if (prevItemContext) {
        prevItemContext.after(contextItem);
      }
    }
    if (checkIt) {
      menuitem.setAttribute("checked", "");
    }
    updateCountInMenu(panel);
  }
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

nestTabs = function(label) {
  let contextTab = nativeTreeTabs.contextTab;
  let tabs = (multiSelected(contextTab)) ?
    gBrowser.selectedTabs : [contextTab];
  let multi = (tabs.length > 1) ? true : false;
  let contextTabRoot = getRootTab(contextTab);
  let ancestorRoot = contextTabRoot;

  while (ancestorRoot && !multiSelected(ancestorRoot)) {
    //check if multiselected ancestor exists
    ancestorRoot = getRootTab(ancestorRoot);
  }
  if (ancestorRoot && multiSelected(ancestorRoot)) {
    contextTabRoot = ancestorRoot;
  }

  let nestDepth;

  if (contextTabRoot) {
    if (!multiSelected(contextTabRoot)) {
      // tabIndex = getClosestZeroDepthTab(contextTab, "down");
      // tabIndex = (tabIndex) ? getPosition(tabIndex) : gBrowser.tabs.length;
      tabIndex = contextTab;
      nestDepth = getTreeDepth(contextTab);
    } else {
      tabIndex = contextTabRoot;
      nestDepth = getTreeDepth(contextTabRoot);
    }
  } else {
    tabIndex = contextTab;
    nestDepth = getTreeDepth(contextTab);
  }

  let nestTab = window.gBrowser.addTab(
    "", {
      tabIndex: getPosition(tabIndex),
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    }
  );

  if (!nestTab) {
    throw new Error("Could not open new tab.");
  }

  gBrowser.moveTabBefore(nestTab, tabIndex)
  setTreeDepth(nestTab, nestDepth);
  setTimeout(() => {
    nestTab.label = label;
  }, 20);

  nestTab.setAttribute("nestTab", label.toString());
  setCustomTabValue(nestTab, "nestTab", label.toString());
  let tabsToMove = new Array();

  tabs.forEach(function(aTab) {
    if (aTab.splitview) {
      aTab = aTab.splitview;
    }
    if (aTab.hasAttribute("moving-to-nest")) {
      return;
    }
    tabsToMove.push(aTab);
    aTab.setAttribute("moving-to-nest", "true");
    let aTabDepth = getTreeDepth(aTab);
    let nextTab = getNextTab(aTab);
    while (nextTab) {
      let nextTabDepth = getTreeDepth(nextTab);
      if (nextTabDepth != null && nextTabDepth <= aTabDepth) {
        break;
      }
      nextTab.setAttribute("moving-to-nest", "true");
      nextTab = getNextTab(nextTab);
    }
  });

  tabsToMove.reverse().forEach(function(aTab) {

    let aTabDepth = getTreeDepth(aTab);
    let nextTab = getNextTab(aTab);
    let nextTabDepth = (nextTab) ? getTreeDepth(nextTab) : null;
    if (nextTabDepth && nextTabDepth > aTabDepth) {
      setTreeDepth(nextTab, 0);
    }
    let prevPosition = getPosition(aTab);
    gBrowser.moveTabAfter(aTab, nestTab);

    setTreeDepth(aTab, nestDepth + 1);
    setOpener(aTab, nestTab);

    // removeSkipNextMoveCheck(aTab);
    if (nextTabDepth && nextTabDepth > aTabDepth) {
      setTreeDepth(nextTab, nextTabDepth);
    }

    nativeTreeTabs.updateChildrenFromIndex(aTab, prevPosition, getPosition(aTab), aTabDepth, groupState = false, forceMultiselected = true);

  });

  tabs.forEach(function(aTab) {
    if (aTab.splitview) {
      aTab = aTab.splitview;
    }
    if (!aTab.hasAttribute("moving-to-nest"))
      return;
    aTab.removeAttribute("moving-to-nest");
    let aTabDepth = getTreeDepth(aTab);
    let nextTab = getNextTab(aTab);
    while (nextTab) {
      let nextTabDepth = getTreeDepth(nextTab);
      if (nextTabDepth != null && nextTabDepth <= aTabDepth) {
        break;
      }
      nextTab.removeAttribute("moving-to-nest");
      nextTab = getNextTab(nextTab);
    }
  });

  if (tabs.includes(window.gBrowser.selectedTab)) {
    window.gBrowser.selectedTabs = window.gBrowser.selectedTab;
  }
}

addNestTabsInTabContextMenu = function() {

  let elementsCreated = new Array();
  //Create popup
  function createMiniPopup(id, label, doneAction) {
    let popup = document.createXULElement("panel");
    popup.id = id;

    let menuMainDiv = document.createElement('div');
    menuMainDiv.style.display = "flex";
    menuMainDiv.style.flexFlow = "column";
    menuMainDiv.style.alignItems = "center";

    popup.appendChild(menuMainDiv);

    let title = document.createXULElement("menuitem");
    title.setAttribute("label", label);
    title.setAttribute("class", "miniPopup-title");
    title.style.fontWeight = "600";
    title.style.fontSize = "15px";
    menuMainDiv.appendChild(title);

    let inputItem = document.createXULElement("hbox");
    inputItem.setAttribute("align", "center");
    inputItem.style.padding = "8px 12px";

    let textbox = document.createElement("input");
    textbox.type = "text";
    textbox.setAttribute("flex", "1");
    textbox.setAttribute("placeholder", "Enter name...");
    textbox.style.minWidth = "200px";
    textbox.style.textAlign = "center";
    inputItem.appendChild(textbox);
    menuMainDiv.appendChild(inputItem);

    let buttonBox = document.createXULElement("hbox");
    buttonBox.setAttribute("pack", "center");
    buttonBox.style.padding = "8px 0 12px";

    let doneBtn = document.createXULElement("button");
    doneBtn.setAttribute("label", "Done");
    doneBtn.style.minWidth = "90px";
    doneBtn.style.minHeight = "30px";

    let cancelBtn = document.createXULElement("button");
    cancelBtn.setAttribute("label", "Cancel");
    cancelBtn.style.minWidth = "90px";
    doneBtn.style.minHeight = "30px";

    buttonBox.appendChild(doneBtn);
    buttonBox.appendChild(cancelBtn);
    menuMainDiv.appendChild(buttonBox);

    function handleDone() {
      let value = textbox.value.trim();
      if (value) {
        doneAction(value);
        popup.hidePopup();
      }
    }

    function handleCancel() {
      popup.hidePopup();
    }

    doneBtn.addEventListener("command", handleDone);
    cancelBtn.addEventListener("command", handleCancel);

    textbox.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleDone();
      if (e.key === "Escape") handleCancel();
    });

    return popup;
  }

  function renameNest(label) {
    let nestTab = nativeTreeTabs.contextTab;
    setTimeout(() => {
      nestTab.label = label;
    }, 20);
    nestTab.setAttribute("nestTab", label.toString());
    setCustomTabValue(nestTab, "nestTab", label.toString());
  }

  let mainPopupSet = document.getElementById('mainPopupSet');
  if (!mainPopupSet) return;

  let menupopup = createMiniPopup("new-root-popup", "Nest Tabs", nestTabs);
  let renameNestMenupopup = createMiniPopup("rename-nest-menupopup", "Rename label", renameNest);

  mainPopupSet.appendChild(menupopup);
  mainPopupSet.appendChild(renameNestMenupopup);
  elementsCreated.push(menupopup);
  elementsCreated.push(renameNestMenupopup);

  let tabContextMenu = document.getElementById("tabContextMenu");
  if (!tabContextMenu) return;

  //Nest option
  let nestContext = document.createXULElement("menuitem");
  nestContext.setAttribute("id", "nest-tabs-contextmenu");
  nestContext.setAttribute("label", "Nest tabs");
  nestContext.setAttribute("accesskey", "n");
  nestContext.setAttribute("custom-context-item", "");

  //Insert in correct position
  let context_position = (getPref("browser.tabs.contextmenu.altstructure.enabled") == true) ?
    document.getElementById("context_moveTabToSplitView").previousSibling :
    document.getElementById("moveTopanel-tab-submenu");
  if (context_position) {
    context_position.after(nestContext);
  }
  elementsCreated.push(nestContext);
  try {
    if (TabContextMenu.MENU_SECTIONS) {
      if (!TabContextMenu.MENU_SECTIONS.classic.tabContextMenu[0].items.includes(("#" + nestContext.id)))
        TabContextMenu.MENU_SECTIONS.classic.tabContextMenu[0].items.splice(3, 0, ("#" + nestContext.id));
      if (!TabContextMenu.MENU_SECTIONS.altstructure.tabContextMenu[2].items.includes(("#" + nestContext.id)))
        TabContextMenu.MENU_SECTIONS.altstructure.tabContextMenu[2].items.splice(0, 0, ("#" + nestContext.id));
    }
  } catch (error) {}

  //Rename option
  let renameNestContext = document.createXULElement("menuitem");
  renameNestContext.setAttribute("id", "rename-nest-contextmenu");
  renameNestContext.setAttribute("label", "Rename");
  renameNestContext.setAttribute("accesskey", "R");
  renameNestContext.setAttribute("custom-context-item", "");
  try {
    if (TabContextMenu.MENU_SECTIONS) {
      if (!TabContextMenu.MENU_SECTIONS.classic.tabContextMenu[0].items.includes(("#" + renameNestContext.id)))
        TabContextMenu.MENU_SECTIONS.classic.tabContextMenu[0].items.unshift("#" + renameNestContext.id);
      if (!TabContextMenu.MENU_SECTIONS.altstructure.tabContextMenu[0].items.includes(("#" + renameNestContext.id)))
        TabContextMenu.MENU_SECTIONS.altstructure.tabContextMenu[0].items.unshift("#" + renameNestContext.id);
    }
  } catch (error) {}

  //Insert first
  tabContextMenu.prepend(renameNestContext);
  elementsCreated.push(renameNestContext);

  let ids = ["context_openANewTab", "context_moveTabToNewGroup", "context_moveTabToGroup", "moveTopanel-tab-submenu", "context_moveTabOptions", "context_closeTabOptions", "rename-nest-contextmenu"];

  function updateTabContextMenu(aEvent) {
    if (aEvent.target !== tabContextMenu) return;
    let contextTab = TabContextMenu.contextTab;
    if (contextTab.hasAttribute("nestTab")) {
      tabContextMenu.childNodes.forEach(function(child) {
        if (!ids.includes(child.id)) {
          child.style.display = "none";
        }
      });
      tabContextMenu.querySelector("#rename-nest-contextmenu").style.display = "";
      return;
    } else {
      tabContextMenu.childNodes.forEach(function(child) {
        child.style.display = "";
      });
      tabContextMenu.querySelector("#rename-nest-contextmenu").style.display = "none";
    }
    if (contextTab.pinned) {
      tabContextMenu.querySelector("#nest-tabs-contextmenu").style.display = "none";
    }

    let multiple = (multiSelected(contextTab)) ?
      true : false;
    if (!multiple && moveChildren) {
      let nextTab = getNextTab(contextTab);
      if (nextTab && getTreeDepth(nextTab) > getTreeDepth(contextTab)) {
        multiple = true;
      }
    }
    let miniPopupTitle = menupopup.querySelector(".miniPopup-title")
    if (multiple) {
      nestContext.setAttribute("label", "Nest Tabs");
      if (miniPopupTitle != null)
        menupopup.querySelector(".miniPopup-title").label = "Nest Tabs";
    } else {
      nestContext.setAttribute("label", "Nest Tab");
      if (miniPopupTitle != null)
        menupopup.querySelector(".miniPopup-title").label = "Nest Tab";
    }
  }
  tabContextMenu.addEventListener("popupshowing", updateTabContextMenu);
  let originalNestContextRemove = nestContext.remove;
  nestContext.remove = function() {
    tabContextMenu.removeEventListener("popupshowing", updateTabContextMenu);
    originalNestContextRemove.apply(this, arguments);
  }
  nestContext.addEventListener("click", (aEvent) => {
    let contextTab = TabContextMenu.contextTab;
    nativeTreeTabs.contextTab = contextTab;
    menupopup.openPopup(contextTab, "before_start", 25, 100, false, false);
    makePopupStayOpen(menupopup, null);
    let textbox = menupopup.querySelector("input");
    setTimeout(() => {
      textbox.value = contextTab.label;
      textbox.focus();
      textbox.select();
    }, 50);
  });

  renameNestContext.addEventListener("click", (aEvent) => {
    let contextTab = TabContextMenu.contextTab;
    nativeTreeTabs.contextTab = contextTab;
    renameNestMenupopup.openPopup(contextTab, "before_start", 25, 100, false, false);
    makePopupStayOpen(renameNestMenupopup, null);
    let textbox = renameNestMenupopup.querySelector("input");
    setTimeout(() => {
      textbox.value = contextTab.label;
      textbox.focus();
      textbox.select();
    }, 50);
  });

  return elementsCreated;
}

addMoveToPanelMenuInTabContextMenu = function() {
  let tabContextMenu = document.getElementById("tabContextMenu");
  if (!tabContextMenu) return;

  let elementsCreated = new Array();

  let submenu = document.createXULElement("menu");
  elementsCreated.push(submenu);
  submenu.setAttribute("id", "moveTopanel-tab-submenu");
  submenu.setAttribute("custom-context-item", "");
  try {
    if (TabContextMenu.MENU_SECTIONS) {
      if (!TabContextMenu.MENU_SECTIONS.classic.tabContextMenu[0].items.includes(("#" + submenu.id)))
        TabContextMenu.MENU_SECTIONS.classic.tabContextMenu[0].items.splice(2, 0, ("#" + submenu.id));
      if (!TabContextMenu.MENU_SECTIONS.altstructure.tabContextMenu[2].items.includes(("#" + submenu.id)))
        TabContextMenu.MENU_SECTIONS.altstructure.tabContextMenu[2].items.splice(1, 0, ("#" + submenu.id));
    }
  } catch (error) {}
  submenu.setAttribute("label", "Move to Panel...");
  submenu.setAttribute("accesskey", "a");

  let menupopup = document.createXULElement("menupopup");
  elementsCreated.push(menupopup);
  menupopup.setAttribute("id", "tab-context-panel-actions");

  addMenuItem(menupopup, "Create New Panel", (aTab, aEvent) => {
    let forceShow = (aEvent.ctrlKey) ? true : false;
    let tabs = (multiSelected(TabContextMenu.contextTab)) ?
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
    elementsCreated.push(tabGroupMoveToPanel);
    tabGroupMoveToPanel.setAttribute("id", "moveTopanel-tabgroup-submenu");
    tabGroupMoveToPanel.setAttribute("class", "subviewbutton");
    tabGroupMoveToPanel.setAttribute("label", "Move to Panel...");
    tabGroupMoveToPanel.setAttribute("accesskey", "a");

    let groupSubPopup = document.createXULElement("menupopup");
    elementsCreated.push(groupSubPopup);
    groupSubPopup.setAttribute("id", "tabgroup-context-panel-actions");
    addMenuItem(groupSubPopup, "Create New Panel", (aTab, aEvent) => {
      let forceShow = (aEvent.ctrlKey) ? true : false;
      let group = gBrowser.tabGroupMenu.activeGroup.tabs.slice();
      group.forEach(function(tab) {
        skipNextMoveCheck(tab);
      });
      window.nativeTreeTabs.tabPanelOpen(group, label = null, id = null, forceShow, index = null, true);
      group.forEach(function(tab) {
        removeSkipNextMoveCheck(tab);
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
            skipNextMoveCheck(tab);
          });
          window.nativeTreeTabs.moveTabsToPanel(group, panel, forceShow, true);
          group.forEach(function(tab) {
            removeSkipNextMoveCheck(tab);
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
  return elementsCreated;
}

searchTabs = function() {
  gTabsPanel.searchTabs();
}

addNTTSidebarHeader = function() {
  let elementsCreated = new Array();
  let mainDiv = document.createElement("div");
  mainDiv.setAttribute("id", "NTT-header");
  elementsCreated.push(mainDiv);
  //Insert on top of sidebar
  let sidebarMain = document.querySelector(["sidebar-main"]);
  sidebarMain.parentNode.insertBefore(mainDiv, sidebarMain);
  let [elements, style] = addTabPanelButton(mainDiv);
  elementsCreated.push(...elements);

  // let searchButton = document.createElement("div");
  // searchButton.setAttribute("id", "search-all-tabs-button");

  // searchButton.setAttribute("class", "button-background");
  // let buttonImage = document.createElement("image");

  // searchButton.appendChild(buttonImage);

  // mainDiv.appendChild(searchButton);
  // searchButton.addEventListener("click", function(aEvent) {
  //   let button = aEvent.button;
  //   if (button != 0) {
  //     return;
  //   }
  //   searchTabs();
  // });

  return [elementsCreated, style];
}

addTabPanelButton = function(mainDiv) {
  //Add new tab context menu option
  let elementsCreated = new Array();
  let contextElements = addMoveToPanelMenuInTabContextMenu();
  elementsCreated.push(...contextElements);
  //Create Button
  let tabPanelGroup = document.createElement("div");
  elementsCreated.push(tabPanelGroup);
  tabPanelGroup.setAttribute("id", "tab-panels-group");

  let tabPanelName = document.createElement("h1");
  tabPanelName.setAttribute("id", "tab-panels-name");
  // tabPanelName.setAttribute("class", "tab-panel tools-overflow");
  tabPanelName.innerText = nativeTreeTabs.defaultPanelName.value;

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
  let menupopup = document.createXULElement("panel");
  elementsCreated.push(menupopup);
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
      draggedItem.style.background = "-moz-menuhover";
      document.addEventListener("mousemove", handleMousemove);
      document.addEventListener("mouseup", handleMouseUp, true);
    }
  });

  let handleMousemove = function(aEvent) {
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

  let dragEnds = function(clickOnly = false) {
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

  let handleMouseUp = function(aEvent) {
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

  let style = loadTabPanelsstyle();
  return [elementsCreated, style];
}

function smartSidebarResize(enable) {
  if (enable) {
    //sidebar autohide
    window.addEventListener('sizemodechange', toggleSidebars, {
      capture: true
    });
    toggleSidebars();
  } else {
    SidebarController._state.updateVisibility(false, true);
    Services.prefs.setStringPref("sidebar.visibility", "always-show");
    window.removeEventListener('sizemodechange', toggleSidebars, {
      capture: true
    });
  }
}

function toggleSidebars() {
  if (nativeTreeTabs.autohideSidebar.value) {
    if (window.windowState === 1) {
      SidebarController._state.updateVisibility(false, true);
      if (nativeTreeTabs.autohideSidebarNormalModeAutoExpand.value)
        Services.prefs.setStringPref("sidebar.visibility", "always-show");

    } else if (window.windowState === 3) {
      if (nativeTreeTabs.autohideSidebarNormalModeAutoExpand.value)
        Services.prefs.setStringPref("sidebar.visibility", "expand-on-hover");
      else
        Services.prefs.setStringPref("sidebar.visibility", "always-show");
      SidebarController._state.updateVisibility(false, false);
    }
  }
}

let modifyCustomizePage = {
  //add an extra section, for the script options, in sidebar customize settings
  observersSet: new Map(),
  section: null,
  initialized: false,

  start: function() {
    if (this.initialized == false) {
      Services.obs.addObserver(this.observeDocs, "chrome-document-global-created", false);
      this.initialized = true;
    }
  },

  unload: function() {
    if (this.initialized == true) {
      Services.obs.removeObserver(this.observeDocs, "chrome-document-global-created", false);
      this.initialized = false;
    }
  },

  observeDocs: function(aSubject) {
    if (!(aSubject instanceof Ci.nsIDOMWindow)) return;
    const win = aSubject;
    const doc = win.document;
    if (doc.location.href !== CUSTOMIZE_URL) return;
    if (doc.readyState === "complete") {
      modifyCustomizePage.load(doc);
    } else {
      doc.addEventListener("DOMContentLoaded", modifyCustomizePage, {
        once: true
      });
    }
  },

  handleEvent: function(aEvent) {
    let document = aEvent.originalTarget;
    // let window = document.defaultView;
    if (document.modifier == null) {
      //make sure only one injector is loaded
      document.modifier = 1;
      this.load(document);
    }
  },

  updateElement: function(element, name) {
    let prefValue = getPref(name);
    if (element.tagName == "MOZ-CHECKBOX") {
      if (prefValue == true) {
        element.setAttribute("checked", "");
      } else {
        element.removeAttribute("checked");
      }
    } else if (element.tagName == "MOZ-SELECT") {
      element.value = prefValue;
    }
  },

  observeTopic: function(topic, element) {
    Services.prefs.addObserver(topic, this);
    this.observersSet.set(topic, element);
  },

  checkIfEnabled: function() {
    let enabled = getPref("treeTabs.enabled");
    if (enabled == false) {
      this.section.setAttribute("section-disabled", "");
    } else if (enabled == true) {
      this.section.removeAttribute("section-disabled");
    }
  },

  observe: function(subject, topic, name) {
    if (topic == "nsPref:changed") {
      if (name == "treeTabs.enabled") {
        this.checkIfEnabled();
      }
      let element = this.observersSet.get(name);
      if (element != null) {
        this.updateElement(element, name);
      }
    }
  },

  load: function(doc) {
    const nttVersion = getPref("treeTabs.version");
    let versionString = (nttVersion == null) ? "" : " (v" + nttVersion + ")";

    //find target
    let sidebarCustomize = doc.querySelector("sidebar-customize");
    if (sidebarCustomize == null || sidebarCustomize.shadowRoot == null) return;
    shadowDomain = sidebarCustomize.shadowRoot;
    const scrollable = shadowDomain.querySelector(".sidebar-panel-scrollable-content");
    if (scrollable == null || shadowDomain.getElementById("tree-tabs-settings")) return;

    //Main element
    const extra = doc.createElement("moz-fieldset");
    extra.className = "customize-group";
    extra.id = "ntt-setting-section";
    extra.label = "Tree Tabs Settings"
    extra.supportPage = versionString;
    this.section = extra;
    scrollable.appendChild(extra);

    this.checkIfEnabled();

    function createTitleDiv(name, sublabel = null, parent) {
      let hbox = doc.createXULElement("hbox");
      hbox.setAttribute("class", "ntt-input ntt-title");
      let labelElement = doc.createElement("label");
      labelElement.textContent = name;
      hbox.appendChild(labelElement);
      if (sublabel != null) {
        let subLabelElement = doc.createElement("label");
        subLabelElement.setAttribute("class", "sublabel");
        subLabelElement.textContent = sublabel;
        hbox.appendChild(subLabelElement);
      }
      parent.appendChild(hbox);
    }

    function createKeyInputBox(pref = null, label, parent) {
      let hbox = doc.createXULElement("hbox");
      hbox.setAttribute("class", "ntt-input");

      let labelElement = doc.createElement("label");
      labelElement.textContent = label;

      let div = doc.createElement("div");
      div.setAttribute("class", "input-container");

      let input = doc.createElement("input");
      input.setAttribute("type", "text");

      function formatShortcut(modifiers, key) {
        //shortcut object to string
        //output example => "Ctrl + A"
        //return only uppercase, and not shift modified symbols/numbers
        // keycode for "!"" and "1" is the same => returns "1" 
        // keycode for ">"" and "." is the same => returns "." 
        let parts = [];
        if (modifiers.ctrl) parts.push("Ctrl");
        if (modifiers.alt) parts.push("Alt");
        if (modifiers.shift) parts.push("Shift");
        if (modifiers.meta) parts.push("Meta");
        const codeToKey = new Map([[65, "A"], [66, "B"], [67, "C"], [68, "D"], [69, "E"], [70, "F"], [71, "G"], [72, "H"], [73, "I"], [74, "J"], [75, "K"], [76, "L"], [77, "M"], [78, "N"], [79, "O"], [80, "P"], [81, "Q"], [82, "R"], [83, "S"], [84, "T"], [85, "U"], [86, "V"], [87, "W"], [88, "X"], [89, "Y"], [90, "Z"], [48, "0"], [49, "1"], [50, "2"], [51, "3"], [52, "4"], [53, "5"], [54, "6"], [55, "7"], [56, "8"], [57, "9"], [190, "."], [188, ","], [59, ";"], [222, "'"], [219, "["], [221, "]"], [220, "\\"], [191, "/"], [192, "`"], [173, "-"], [61, "="], [13, "Enter"], [9, "Tab"], [8, "Backspace"], [46, "Delete"], [27, "Escape"], [32, "Space"], [38, "ArrowUp"], [40, "ArrowDown"], [37, "ArrowLeft"], [39, "ArrowRight"], [112, "F1"], [113, "F2"], [114, "F3"], [115, "F4"], [116, "F5"], [117, "F6"], [118, "F7"], [119, "F8"], [120, "F9"], [121, "F10"], [122, "F11"], [123, "F12"], [96, "0"], [97, "1"], [98, "2"], [99, "3"], [100, "4"], [101, "5"], [102, "6"], [103, "7"], [104, "8"], [105, "9"], [110, "."], [111, "/"], [106, "*"], [109, "-"], [107, "+"], [13, "Enter"]]);
        key = codeToKey.get(key);
        parts.push(key);
        return parts.join(" + ");
      }

      function setValue(input, value) {
        //replaces arrow strings with up/down/...
        value = value.replaceAll("ArrowUp", "Up").replaceAll("ArrowRight", "Right").replaceAll("ArrowLeft", "Left").replaceAll("ArrowDown", "Down");
        input.value = value;
        input.title = value;
        input.removeAttribute("unset");
      }

      function clearVal(e) {
        setPref(pref, "");
        input.value = "Press new keys...";
        input.setAttribute("unset", "");
      }

      function resetVal(e) {
        setPref(pref, "reset");
        setValue(input, getPref(pref));
      }

      const captureHandler = (e) => {
        const mods = {
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey
        };
        if (e.key == "Escape") {
          input.blur();
          return;
        }
        if (e.key == "Backspace") {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        } else if (e.key.length > 1 && !(e.key.startsWith("Arrow"))) {
          //only accept "normal" keys
          return;
        }
        document.removeEventListener("keydown", captureHandler, {
          capture: true
        });

        e.preventDefault();
        e.stopImmediatePropagation();
        const shortcutStr = formatShortcut(mods, e.keyCode);

        // Save to pref
        setPref(pref, shortcutStr)
        //Update input box
        setValue(input, shortcutStr);
        document.removeEventListener("keydown", captureHandler, {
          capture: true
        });
        input.blur();
      };

      input.addEventListener("click", () => {
        input.value = "Press new keys...";
        input.setAttribute("focused", "true");

        document.addEventListener("keydown", captureHandler, {
          capture: true
        });
      });

      input.addEventListener("blur", (aEvent) => {
        document.removeEventListener("keydown", captureHandler, {
          capture: true
        });
        setValue(input, getPref(pref));
      });

      let b3 = doc.createElement("button");
      b3.setAttribute("class", "extra-button restore-button");
      b3.addEventListener("click", (e) => resetVal(e));
      b3.title = "Restore to Default";
      b3.setAttribute("label", "Restore to Default");

      let b4 = doc.createElement("button");
      b4.setAttribute("class", "extra-button delete-button");
      b4.addEventListener("click", (e) => clearVal(e));
      b4.title = "Clear shortcut";
      b4.setAttribute("label", "Clear shortcut");

      if (pref != null) {
        let prefValue = getPref(pref);
        if (prefValue != null && prefValue != "") {
          setValue(input, prefValue)
        } else {
          input.value = "Press new keys...";
          input.setAttribute("unset", "");
        }
      }
      hbox.appendChild(labelElement);
      div.appendChild(input);
      hbox.appendChild(div);
      hbox.appendChild(b3);
      hbox.appendChild(b4);
      parent.appendChild(hbox);
      return hbox;
    }

    function createNumberInputBox(pref = null, options, label, parent) {
      let hbox = doc.createXULElement("hbox");
      hbox.setAttribute("class", "ntt-input");

      let labelElement = doc.createElement("label");
      labelElement.textContent = label;

      let div = doc.createElement("div");
      div.setAttribute("class", "input-container");

      let input = doc.createElement("input");
      input.setAttribute("type", "number");
      input.setAttribute("min", options.min);
      input.setAttribute("step", options.step);
      input.setAttribute("max", options.max);

      function checkAndSetPref() {
        //max decimals 2 ,rounds up
        // removes unwanted zeros  2.00  => 2
        let value = (+parseFloat(input.value).toFixed(1)).toString();

        if (isNaN(value) || value < options.min || value > options.max) {
          //check limits
          input.value = getPref(pref);
        } else {
          input.value = value;
          setPref(pref, value);
        }
      }

      function changeVal(e, dir) {
        if (dir == 1)
          input.stepUp();
        else
          input.stepDown();
        let check = checkAndSetPref();
      }

      function resetVal(e) {
        clearUserPref(pref);
        input.value = getPref(pref);
      }

      input.addEventListener("keydown", (aEvent) => {
        if (aEvent.key === "Enter") {
          checkAndSetPref();
          input.blur();
        } else if (aEvent.key === "Escape") {
          input.blur();
        }
      });
      input.addEventListener("blur", (aEvent) => {
        input.value = getPref(pref)
      });

      let b1 = doc.createElement("button");
      b1.addEventListener("click", (e) => changeVal(e, -1));
      b1.innerHTML = "-";
      b1.setAttribute("label", "Increase");

      let b2 = doc.createElement("button");
      b2.innerHTML = "+";
      b2.addEventListener("click", (e) => changeVal(e, 1));
      b2.setAttribute("label", "Decrease");

      let b3 = doc.createElement("button");
      b3.setAttribute("class", "extra-button restore-button");
      b3.addEventListener("click", (e) => resetVal(e));
      b3.title = "Restore to Default";
      b3.setAttribute("label", "Restore to Default");

      if (pref != null) {
        let prefValue = getPref(pref);
        if (prefValue != null) {
          input.setAttribute("value", prefValue);
        }
      }
      hbox.appendChild(labelElement);
      div.appendChild(b1);
      div.appendChild(input);
      div.appendChild(b2);
      hbox.appendChild(div);
      hbox.appendChild(b3);
      parent.appendChild(hbox);
      return hbox;
    }

    function createMenuListBox(pref = null, label, options, parent, nest = null) {

      if (pref != null) {
        let prefValue = getPref(pref);
        // modifyCustomizePage.observeTopic(pref, selectBox);
      } else {
        return;
      }

      let hbox = doc.createXULElement("hbox");
      hbox.setAttribute("class", "ntt-input ntt-list");
      hbox.setAttribute("pressed", "");

      let labelElement = doc.createElement("label");
      labelElement.textContent = label;
      hbox.appendChild(labelElement);

      let collapseContainer = doc.createElement("div");
      collapseContainer.setAttribute('class', 'collapse-container');

      let collapseButton = doc.createElement("button");
      collapseButton.setAttribute('class', 'extra-button collapse-button');
      collapseContainer.appendChild(collapseButton);
      collapseContainer.addEventListener("click", (e) => togglePress(e));

      let mainDiv = doc.createElement("div");
      let itemsMenu = doc.createElement('menulist');
      let itemsMenuHider = doc.createElement('menulist');
      itemsMenuHider.setAttribute('class', 'menulist-hider');
      itemsMenuHider.addEventListener("click", (e) => togglePress(e));

      mainDiv.appendChild(itemsMenu);
      mainDiv.appendChild(itemsMenuHider);
      hbox.appendChild(mainDiv);
      hbox.appendChild(collapseContainer);

      function togglePress(aEvent) {
        if (!hbox.hasAttribute("pressed"))
          hbox.setAttribute("pressed", "");
        else
          hbox.removeAttribute("pressed", "");
      }

      function updatePref() {
        let valString = "";
        itemsMenu.childNodes.forEach((item, index) => {
          if (index > 0) {
            valString = valString + ",";
          }
          valString = valString + item.getAttribute("value").toString();
        })
        setPref(pref, valString);
      }

      function moveItem(aEvent, dir) {
        let item = aEvent.target.closest(".ntt-list-item");
        if (item) {
          let sibling;
          if (dir == 1) {
            sibling = item.nextSibling;
            if (sibling)
              sibling.after(item);
          } else {
            sibling = item.previousSibling;
            if (sibling)
              itemsMenu.insertBefore(item, sibling);
          }
          updatePref();
        }
      }

      function populateItemMenu() {
        let val = getPref(pref);
        if (val == null) {
          return;
        }
        let order = val.split(",");
        while (itemsMenu.childNodes.length > 0) {
          itemsMenu.removeChild(itemsMenu.lastChild);
        }
        for (var i = 0; i < order.length; i++) {
          let index = parseInt(order[i], 10);
          let item = options.find(option => option.value == index);
          if (item) {
            let emptyOpt = doc.createElement("div");
            emptyOpt.setAttribute('class', 'ContentSelectDropdown-item-0 ntt-list-item');
            emptyOpt.setAttribute("value", item.value);
            emptyOpt.setAttribute("label", item.label);
            emptyOpt.setAttribute("image", "chrome://global/skin/icons/move-16.svg");
            emptyOpt.setAttribute("draggable", "true");

            let optionImg = doc.createElement("img");
            optionImg.setAttribute("src", "chrome://global/skin/icons/move-16.svg");

            let emptyOptlabel = doc.createElement("label");
            emptyOptlabel.textContent = item.label;

            let buttonContainer = doc.createElement("div");
            buttonContainer.setAttribute('class', 'input-container');
            let b1 = doc.createElement("button");
            b1.addEventListener("click", (e) => moveItem(e, -1));
            b1.setAttribute('class', 'extra-button moveup-button');
            let b2 = doc.createElement("button");
            b2.addEventListener("click", (e) => moveItem(e, 1));
            b2.setAttribute('class', 'extra-button movedown-button');

            emptyOpt.appendChild(optionImg);
            emptyOpt.appendChild(emptyOptlabel);
            buttonContainer.appendChild(b1);
            buttonContainer.appendChild(b2);
            emptyOpt.appendChild(buttonContainer);
            itemsMenu.appendChild(emptyOpt);
          }
        }
      }
      populateItemMenu();

      let isDragging = false;
      let draggedItem = null;
      let previousNextitem = null;
      let helddown = 0;
      let dragStartPos;

      itemsMenu.addEventListener("mousedown", (aEvent) => {
        let button = aEvent.button;
        if (button != 0) {
          return;
        }
        aEvent.preventDefault();
        let targetButton = aEvent.target.closest(".ntt-list-item button");
        if (targetButton) {
          return;
        }
        let item = aEvent.target.closest(".ntt-list-item");
        if (item) {
          helddown = 0;
          isDragging = true;
          draggedItem = item;
          dragStartPos = Array.prototype.indexOf.call(item.parentNode.children, item) - 1;
          containerOffsetY = draggedItem.offsetTop;
          clientTop = aEvent.clientY;
          draggedItem.classList.add("dragging");
          draggedItem.style.top = containerOffsetY + "px";
          draggedItem.style.position = "absolute";
          draggedItem.style.background = "-moz-menuhover";
          doc.addEventListener("mousemove", handleMousemove);
          doc.addEventListener("mouseup", handleMouseUp, true);

          let nextItem = draggedItem.nextSibling;
          if (nextItem) {
            nextItem.style.marginTop = "25px";
            previousNextitem = nextItem;
          }
        }
      });

      let handleMousemove = function(aEvent) {
        if (isDragging && draggedItem) {
          helddown++;
          draggedItem.style.top = (containerOffsetY - (clientTop - aEvent.clientY)) + "px";
          let itemSibilings = Array.from(itemsMenu.querySelectorAll(".ntt-list-item:not(.dragging)"));
          let nextItem = itemSibilings.find((sibiling) => {
            return (
              aEvent.clientY - itemsMenu.getBoundingClientRect().top <=
              sibiling.offsetTop + sibiling.offsetHeight / 2
            );
          });
          if (previousNextitem) {
            previousNextitem.style.marginTop = "";
          }
          if (nextItem) {
            nextItem.style.marginTop = "25px";
            previousNextitem = nextItem;
          }
          itemsMenu.insertBefore(draggedItem, nextItem);
        } else {
          doc.removeEventListener("mousemove", handleMousemove);
        }
      }

      let dragEnds = function(clickOnly = false) {
        if (draggedItem) {
          if (previousNextitem)
            previousNextitem.style.marginTop = "";
          draggedItem.style.top = "";
          draggedItem.style.position = "";
          draggedItem.style.background = "";
          draggedItem.classList.remove("dragging");
          isDragging = false;

          let dragEndPos = Array.prototype.indexOf.call(draggedItem.parentNode.children, draggedItem) - 1;
          if (clickOnly) {
            return;
          }

          if (dragStartPos != dragEndPos) {
            let nextItem;
            let itemSibilings = itemsMenu.querySelectorAll("menuitem:not(.dragging)");
            itemSibilings.forEach((sibiling) => {
              sibiling.style.marginTop = "";
              if (sibiling.previousSibling === draggedItem)
                nextItem = sibiling;
            });
            updatePref();
          }
          draggedItem = null;
        }
      }

      let handleMouseUp = function(aEvent) {
        if (draggedItem) {
          if (helddown > 10) {
            aEvent.preventDefault();
            dragEnds();
          } else {
            dragEnds(clickOnly = true);
          }
        }
        doc.removeEventListener("mouseup", handleMouseUp);
      }

      if (nest != null) {
        hbox.slot = "nested";
        nest.appendChild(hbox);
      } else {
        parent.appendChild(hbox);
      }
      return hbox;
    }

    function createSelectBox(pref = null, label, options, type, parent, nest = null) {
      let hbox = doc.createXULElement("hbox");
      hbox.setAttribute("class", "ntt-input");

      let labelElement = doc.createElement("label");
      labelElement.textContent = label;

      let selectBox = doc.createElement("select");
      selectBox.setAttribute("class", "ntt-select");
      selectBox.setAttribute("label", label);

      for (var i = 0; i < options.length; i++) {
        let emptyOpt = doc.createElement("option");
        emptyOpt.setAttribute("value", options[i].value);
        emptyOpt.setAttribute("label", options[i].label);
        selectBox.appendChild(emptyOpt);
      }
      if (pref != null) {
        let prefValue = getPref(pref);
        selectBox.value = prefValue;

        selectBox.addEventListener("change", (e) => {
          let value = selectBox.value;
          if (type == "boolean") {
            if (value == "true")
              value = true;
            else
              value = false;
          } else if (type == "number") {
            value = parseInt(value, 10);
          }
          setPref(pref, value);
        });
        modifyCustomizePage.observeTopic(pref, selectBox);

      }
      hbox.appendChild(labelElement);
      hbox.appendChild(selectBox);

      if (nest != null) {
        hbox.slot = "nested";
        nest.appendChild(hbox);
      } else {
        parent.appendChild(hbox);
      }
      return hbox;
    }

    function createCheckBox(pref = null, label, parent, nest = null) {
      let checkBox = doc.createElement("moz-checkbox");
      checkBox.setAttribute("type", "checkbox");
      checkBox.setAttribute("class", "ntt-checkbox");
      checkBox.setAttribute("label", label);
      checkBox.setAttribute("inputlayout", "inline");

      if (pref != null) {
        let prefValue = getPref(pref);
        if (prefValue == true) {
          checkBox.setAttribute("checked", "");
        }
        checkBox.addEventListener("change", (e) => {
          if (e.target.checked) {
            setPref(pref, true);
          } else {
            setPref(pref, false);
          }
          e.preventDefault();
          e.stopPropagation();
        });
        modifyCustomizePage.observeTopic(pref, checkBox);

      }
      if (nest != null) {
        checkBox.slot = "nested";
        nest.appendChild(checkBox);
      } else {
        parent.appendChild(checkBox);
      }
      return checkBox;
    }

    createCheckBox("treeTabs.enabled", "Enabled", extra);
    createCheckBox("treeTabs.behavior.lockCtrlTabInPanel", "Lock tab switching in Panel", extra);
    createCheckBox("treeTabs.behavior.hopOverCollapsedTabs", "Hop over collapsed tabs", extra);
    let n2 = createCheckBox("treeTabs.behavior.hopOverUnloadedTabs", "Hop over unloaded tabs", extra);
    createCheckBox("treeTabs.behavior.hopOverCollapsedTabsInlcudeRestored", "Include session restored tabs", extra, n2);
    let n1 = createCheckBox("treeTabs.behavior.switchSelectedOnClick", "Click active tab to switch to the last active tab", extra);
    createCheckBox("treeTabs.behavior.switchSelectedOnClickStayOnPanel", "Stay in Panel", extra, n1);
    createCheckBox("treeTabs.behavior.changePanelOnScroll", "Scroll Panel header to cycle between Panels", extra);
    createCheckBox("treeTabs.behavior.collapseTreesAutomatically", "Automatically Collapse Trees", extra);
    createCheckBox("treeTabs.behavior.collapseGroupsAutomatically", "Automatically Collapse Tab Groups", extra);
    let n3 = createCheckBox("treeTabs.behavior.smartResizeSidebar", "Smart expand/collapse sidebar on window size mode change", extra);
    createCheckBox("treeTabs.behavior.smartResizeSidebarNormalModeAutoExpand", "Auto expand on normal mode", extra, n3);
    createSelectBox("browser.tabs.insertRelatedAfterCurrent", "Open new related tabs as:", [{
      label: "First child",
      value: true
    }, {
      label: "Last child",
      value: false
    }], "boolean", extra);
    createMenuListBox("treeTabs.behavior.switchOnClose", "When active tab closes, switch to (priority):", [{
        label: "First child",
        value: 0
    }, {
        label: "Previous sibling",
        value: 1
    }, {
        label: "Next sibling",
        value: 2
    }, {
        label: "Parent tab",
        value: 3
    }, {
        label: "Previous tab",
        value: 4
    }, {
        label: "Next tab",
        value: 5
    }, {
        label: "Last active tab",
        value: 6
    }, {
        label: "Last active tab (stay on panel)",
        value: 7
    },
    ], extra);

    // createSelectBox("treeTabs.behavior.insertTabs", "Open tabs as",["First child","Last Child","Sibling",""] extra);
    createTitleDiv("Style options", null, extra);
    createNumberInputBox("treeTabs.tabHeight", {
      min: 10,
      step: 1,
      max: 99
    }, "Tab height:", extra);
    createNumberInputBox("treeTabs.tabBorderRadius", {
      min: 0,
      step: 1,
      max: 99
    }, "Tab border radius:", extra);
    createNumberInputBox("treeTabs.labelFontSize", {
      min: 0,
      step: 0.1,
      max: 99
    }, "Tab font size:", extra);
    createNumberInputBox("treeTabs.rootTabTopMargin", {
      min: 0,
      step: 1,
      max: 99
    }, "Gap between trees:", extra);
    createNumberInputBox("treeTabs.branchTabTopMargin", {
      min: 0,
      step: 1,
      max: 99
    }, "Tree children gap:", extra);
    createNumberInputBox("treeTabs.style.tabIconStart", {
      min: 0,
      step: 0.5,
      max: 99
    }, "Tab Icon start:", extra);
    createNumberInputBox("treeTabs.style.pinnedTabWidth", {
      min: 1,
      step: 1,
      max: 99
    }, "Pinned tabs min width:", extra);
    createCheckBox("treeTabs.style.customText", "Tab text styling", extra);
    createCheckBox("treeTabs.style.customBackground", "Tab background styling", extra);
    createCheckBox("treeTabs.style.customGroups", "Tab Groups styling", extra);
    createSelectBox("treeTabs.style.twistyStyle", "Collapsed tree root tab style", [{
      label: "1",
      value: 0
    }, {
      label: "2",
      value: 1
    }, {
      label: "3",
      value: 2
    }], "number", extra);
    createCheckBox("treeTabs.style.hideContainerLine", "Hide container indicator", extra);


    createTitleDiv("Keyboard Shortcuts", "(click to change)", extra);
    createKeyInputBox("treeTabs.shortcuts.createPanel", "Create new Tab Panel:", extra);
    createKeyInputBox("treeTabs.shortcuts.cycleTabPanels", "Select next Panel:", extra);
    createKeyInputBox("treeTabs.shortcuts.cycleTabPanelsReverse", "Select previous Panel:", extra);
    createKeyInputBox("treeTabs.shortcuts.moveTabUp", "Move tab up:", extra);
    createKeyInputBox("treeTabs.shortcuts.moveTabDown", "Move tab down:", extra);
    createKeyInputBox("treeTabs.shortcuts.indentTabOut", "Indent tab:", extra);
    createKeyInputBox("treeTabs.shortcuts.indentTab", "Outdent tab:", extra);
    createKeyInputBox("treeTabs.shortcuts.flipActive", "Switch to previous active tab:", extra);

    modifyCustomizePage.observeTopic("treeTabs.enabled", extra);

    let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
    let customCSS = `
    moz-fieldset[section-disabled] .ntt-checkbox{
      border-bottom:none!important;
    }
    moz-fieldset[section-disabled] .ntt-checkbox:not(:first-child){
      display:none!important;
    }
    moz-fieldset[section-disabled] .ntt-input{
      display:none!important;
    }
    sidebar-panel-header[data-l10n-id="sidebar-menu-customize-header"]{
      padding-block: 0 !important;
    }
    .sidebar-panel-scrollable-content{
      scrollbar-width: thin;
      scrollbar-color: transparent transparent;
    }
    .sidebar-panel-scrollable-content:hover{
      scrollbar-color: grey transparent;
    }
    fieldset a[support-page="` + versionString + `"]{
      visibility: hidden;
      font-size:0;
      pointer-events:none;
    }
    fieldset a[support-page="` + versionString + `"]:after {
      content: "` + versionString + `";
      visibility: visible;
      font:menu;
      color:var(--sidebar-text-color);
      opacity:0.7;
    }
    .ntt-select{
      padding-block: 5px;
      background-color: color-mix(in srgb, var(--button-background-color-active) 25%, transparent)!important;
      --select-max-width:50%;
    }
    .ntt-input{
      position: relative;
      display: flex;
      padding-block: 0px;
      min-height: 34px;
      align-items: center;
      align-content: center;
      flex-direction:row;
      flex-wrap:nowrap;
    }
    .ntt-input::before {
      content: '';
      order: 1;
    }
    .ntt-input label{
      order: 0;
      text-align: left;
      padding-inline:6px;
    }
    .ntt-input:has(input[type="number"]) label{
      max-width:40%;
      min-width:40%;
    }
    .ntt-input:has(input[type="text"]) label{
      max-width:40%;
      min-width:40%;
    }
    .ntt-input .input-container{
      order: 1;
      display:flex!important;
      margin-left:auto;
      margin-right:0px;
      padding: 0px;
      border:1px solid transparent;
      background-color: color-mix(in srgb, var(--button-background-color-active) 25%, transparent);
      border-radius:2px;
      appearance:none!important;
    }
    .ntt-input input{
      background-color: transparent!important;
        text-align: center!important;
       padding-inline-start: 0px!important;
       padding:0px!important;
       font-weight:500!important;
       font-size: 12px!important;
       border-radius:0!important;
       border: none !important;
    }
    .ntt-input input[type="number"]{
       max-width: 29px!important;
       min-width: 29px!important;
    }
    .ntt-input input[type="text"]{
      padding: 1px!important;
      padding-left: 6px!important;
      padding-right: 6px!important;
      font-size:12px!important;
    }
    .ntt-input .input-container:has(input[type="text"]){
      border-radius:5px!important;
      border:2px solid transparent!important;
      max-width: 100px!important;
      min-width: 100px!important;
    }
    .ntt-input input[unset] {
      opacity:0.7;
      font-style: italic!important;
    }
    .ntt-input button{
      background-color: rgba(0,0,0,0.2)!important;
      appearance:none!important;
      border:none!important;
      font-size: 18px !important;
      font-weight: 600 !important;
      line-height: 0!important;
      width: 24px!important;
      height: 23px!important;
      padding-block-end: 5px;
      padding-inline-end: 4px;
      text-align:center!important;
    }
    .ntt-input .extra-button{
      order: 2;
      margin-left:5px;
      background-repeat: no-repeat;
      background-size: 13px;
       background-position: center;
      -moz-context-properties: fill, stroke!important;
      min-width: fit-content!important;
      min-height: 20px!important;
      fill:currentColor;
      background-color: color-mix(in srgb, var(--button-background-color-active) 25%, transparent)!important;
      opacity:0.7;
    }
    .ntt-input .restore-button{
      background-image: url("chrome://global/skin/icons/undo.svg")!important;
    }   
    .ntt-input .delete-button{
      background-image: url("chrome://global/skin/icons/delete.svg")!important;
    }
    .ntt-list{
      --menuitem-padding:3px;
      --menuitem-margin:1px;
      --menuitem-max-width:unset;
      --menuitem-icon-fill:var(--button-icon-fill);
      flex-direction:column;
      align-items: start;
      border:1px solid var(--panel-separator-color);
      border-radius: var(--border-radius-medium);
      margin-block:10px;
    }
    .ntt-list > label{
      align-self: center;
      text-align:center!important;
    }
    .ntt-list menulist{
      display: flex;
      flex-flow: column;
      position:relative;
    }
    .ntt-list > div{
      width:100%;
    }
    .ntt-list div{
      position:relative;
    }
    .ntt-list .collapse-button{
      background-color:transparent!important;
      background-image: url("chrome://global/skin/icons/arrow-up.svg");
    }
    .ntt-list .collapse-container{
      width:100%;
      position:relative;
      background-color:inherit;
      border-top: 2px solid;
      border-top-color: currentcolor;
      border-color: inherit;
      display: flex;
      justify-content: center;
    }
    .ntt-list[pressed]{

   .collapse-container{
        z-index: 3;
        border-top: 3px solid;
        border-color: inherit;
    }
    .collapse-button{
      background-image: url("chrome://global/skin/icons/arrow-down.svg");
    }
    .ntt-list div{
      position:relative;
    }
    menulist{
      overflow: hidden;
      max-height: 50px;
      overflow: hidden;
      position:relative;
      z-index:-1;
    }
    .ntt-list-item{
      padding:0!Important;
      font-size:11px!important;
      max-height:20px;
    }
    .ntt-list-item img,
    .ntt-list-item button{
      max-height:10px;
      min-height: 10px !important;
      min-width: 10px !important;
      max-width: 10px !important;
    }
   .menulist-hider{
      content:"";
      top:0;
      width:100%;
      height:calc(100% + 2px);
      max-height:unset;
      display:block;
      background:linear-gradient(180deg, color-mix(in srgb, transparent 90% ,var(--sidebar-background-color)),  color-mix(in srgb, transparent 10% ,var(--sidebar-background-color)) 100%);
      overflow: visible;
      position:absolute;
      z-index:3;
    }
    @media (prefers-color-scheme: light) {
      .menulist-hider{
        background:linear-gradient(180deg, rgba(180,180,180,0.15),  rgba(175,175,175,0.4) 100%);
      }
    }
  }

    .ntt-list > label{ 
      padding-block:7px;
    }
    .ntt-list-item{
      width:100%;
      overflow: hidden;
      position:relative;
      width:calc( 100% - 2*var(--menuitem-padding));
      cursor:grab;
      border-bottom:1px solid var(--panel-separator-color);
      fill: var(--button-icon-fill);
      padding: var(--menuitem-padding);
      margin: var(--menuitem-margin);
      align-items: center;
      flex-shrink: 0;
      list-style-image: none;
      max-width: var(--menuitem-max-width);
      --menuitem-icon: normal;
      -moz-context-properties: fill;
      fill: var(--menuitem-icon-fill);
      display:flex;
    }
    .ntt-list-item img{
      width:16px;
      height:16px;
      align-self:center;
    }
    .ntt-list .input-container {
      background-color:transparent!important;
    }
    .ntt-list-item .extra-button{
      background-repeat:no-repeat;
      border:1px solid transparent!important;
      border-radius:30px;
    }
    .ntt-list-item .moveup-button{
      background-image: url("chrome://global/skin/icons/arrow-up.svg");
    }
    .ntt-list-item .movedown-button{
      background-image: url("chrome://global/skin/icons/arrow-down.svg");
    }
    .ntt-list-item:first-child{
      border-top:1px solid var(--panel-separator-color);
    }
    .ntt-list-item:last-child{
      border-bottom:none;
    }
    .ntt-list .dragging{
      cursor:grabbing;
    }

    @media (max-width: 300px) {
      .ntt-input:has(input[type="text"]){
        flex-wrap:wrap;
      } 
      .ntt-input:has(input[type="text"])::before {
        width: 100%;
      }
      .ntt-input:has(input[type="text"]) label{
        max-width:100%!important;
        min-width:100%!important;
        text-align:center!important;
        padding-bottom:5px;
      }
      .ntt-input .input-container:has(input[type="text"]){
        max-width:46%!important;
        min-width:46%!important;
        font-size:14px;
        margin-right:2%;
        margin-left: 10%;
      }
      .ntt-input:has(input[type="text"]) .extra-button{
        margin-left:4%;
      }
      .ntt-input:has(input[type="text"]) {
        padding-block:5px;
      }
    }
    @media (max-width: 200px) {
    .ntt-input .input-container:has(input[type="text"]){
      margin-left: 7%;
    }
  }
    @media (prefers-color-scheme: light) {
      .ntt-input .input-container button{
        background-color: rgba(0,0,0,0.05)!important;
      }
      .ntt-input .input-containerX{
        background-color: color-mix(in srgb, var(--button-background-color-checked) 30%, transparent)!important;
      }
    }
    .ntt-input{
      @media not -moz-pref("browser.nova.enabled") {
          border-bottom: 0.5px solid var(--panel-separator-color);
      }
    }
    .ntt-title {
      @media not -moz-pref("browser.nova.enabled") {
          border-top: 0.5px solid var(--panel-separator-color);
          border-bottom: 0.5px solid color-mix(in srgb, var(--panel-separator-color) 80%, transparent);
      }
    }
    .ntt-input input::-moz-number-spin-up,
    .ntt-input input::-moz-number-spin-down {
      display:none;
      transform: rotate(90deg);
      min-height:20px;
      width:30px;
      margin-top:20px;
      position:absolute;
      z-index:111!important;
    }
    .ntt-input input::-moz-number-spin-down{
      margin-left:-80px;
    }
    .ntt-input input::-moz-number-spin-up{
      right:-20px;
    }
    .ntt-title{
      justify-content:center;
      flex-direction:column;
      padding-inline:0!important;
      background-color: color-mix(in srgb, silver 5%, transparent)!important;
    }
    .ntt-title label{
      margin-left:10px;
      font-weight:600!important;
      transform:scale(1.1);
    }
    .ntt-title .sublabel{
      font-weight:400!important;
    }
    `;

    let styleURI = makeURI(
      `data:text/css;charset=UTF=8,${encodeURIComponent(customCSS)}`
    );

    if (!styleSvc.sheetRegistered(styleURI, styleSvc.AGENT_SHEET)) {
      styleSvc.loadAndRegisterSheet(styleURI, styleSvc.AGENT_SHEET);
    }
  },
}

loadTabPanelsstyle = function() {

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
    max-width:100%;
    min-width: 100%;
    overflow: clip;
    display: flex;
    align-items:center;
}
box:has(>sidebar-main):not([sidebar-launcher-expanded]) #tab-panels-group {
  justify-content:center;
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
    min-width:100%;
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
    opacity: 0.86;
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
menu.subviewbutton{
  &:not([disabled]):hover {
    color: var(--button-text-color-menu-hover);
    background-color: var(--button-background-color-menu-hover)!important;
  }
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
  return [styleURI, styleSvc.AGENT_SHEET]

}

checkOrSetPref = function(topic, value) {
  let pref = getPref(topic);
  if (pref != null) {
    return pref;
  }
  setPref(topic, value);
  return value;
}

loadNTTstyle = function() {

  let rootTabTopMargin = checkOrSetPref("treeTabs.rootTabTopMargin", "10");
  let branchTabTopMargin = checkOrSetPref("treeTabs.branchTabTopMargin", "4");
  let labelFontSize = checkOrSetPref("treeTabs.labelFontSize", "13.4");
  let tabBorderRadius = checkOrSetPref("treeTabs.tabBorderRadius", parseInt(window.getComputedStyle(document.querySelector(["tab"])).getPropertyValue('--tab-border-radius')));
  let tabHeight = checkOrSetPref("treeTabs.tabHeight", "30");
  let tabIconStart = checkOrSetPref("treeTabs.style.tabIconStart", "1.5");
  let pinnedTabWidth = checkOrSetPref("treeTabs.style.pinnedTabWidth", parseInt(window.getComputedStyle(document.querySelector(["tab"])).getPropertyValue('--tab-pinned-expanded-background-width')));
  // --tab-pinned-expanded-background-width
  // --tab-pinned-min-width-expanded
  let closeButtonPadding;
  if (tabHeight > 20)
    closeButtonPadding = 4;
  else if (tabHeight > 15)
    closeButtonPadding = 3;
  else if (tabHeight > 12)
    closeButtonPadding = 1;
  else
    closeButtonPadding = 0;

  let styleSvc = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
    Ci.nsIStyleSheetService
  );
  let customCSS = `
:root {
    --root-tab-top-margin: ` + rootTabTopMargin + `px;
    --branch-tab-top-margin:  ` + branchTabTopMargin + `px;
    --tab-height: ` + tabHeight + `px;
    --label-font-size: ` + labelFontSize + `px;
    --tab-close-button-padding: ` + closeButtonPadding + `px!important;
    --tab-border-radius-forced: ` + tabBorderRadius + `px;
    --group-first-tab-top-margin:  ` + (1 + rootTabTopMargin * 0.7) + `px;
    --tree-tab-default-color: rgb(130, 120, 140);
    --tab-icon-start: ` + tabIconStart + `px;
    --tab-pinned-expanded-background-width: ` + pinnedTabWidth + `px!important;
}
#vertical-tabs {
 tab[tree-depth="0"] { --tab-indent: 0; }
  tab[tree-depth="1"] { --tab-indent: 11; }
  tab[tree-depth="2"] { --tab-indent: 21; }
  tab[tree-depth="3"] { --tab-indent: 31; }
  tab[tree-depth="4"] { --tab-indent: 41; }
  tab[tree-depth="5"] { --tab-indent: 51; }
  tab[tree-depth="6"] { --tab-indent: 61; }
  tab[tree-depth="7"] { --tab-indent: 71; }
  tab[tree-depth="8"] { --tab-indent: 81; }
  tab[tree-depth="9"] { --tab-indent: 91; }
}
#tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab-group  > tab,
#tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] > tab {
    max-width: calc(100% - var(--tab-indent))!important;
    padding-inline-start: calc( ( ( 3.7 * var(--tab-indent) * var(--tab-indent) * var(--tab-indent) + ( 30 * var(--tab-indent) * var(--tab-indent))) / ( 11 * var(--tab-indent) * var(--tab-indent) + ( 10 * var(--tab-indent)) + 100)) * 1%) !important;
}

#vertical-tabs{
  tab-split-view-wrapper:has(tab[tree-depth="0"]){ --tab-indent: 0; }
  tab-split-view-wrapper:has(tab[tree-depth="1"]){ --tab-indent: 11; }
  tab-split-view-wrapper:has(tab[tree-depth="2"]){ --tab-indent: 21; }
  tab-split-view-wrapper:has(tab[tree-depth="3"]){ --tab-indent: 31; }
  tab-split-view-wrapper:has(tab[tree-depth="4"]){ --tab-indent: 41; }
  tab-split-view-wrapper:has(tab[tree-depth="5"]){ --tab-indent: 51; }
  tab-split-view-wrapper:has(tab[tree-depth="6"]){ --tab-indent: 61; }
  tab-split-view-wrapper:has(tab[tree-depth="7"]){ --tab-indent: 71; }
  tab-split-view-wrapper:has(tab[tree-depth="8"]){ --tab-indent: 81; }
  tab-split-view-wrapper:has(tab[tree-depth="9"]){ --tab-indent: 91; }
}

#tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper{
    margin-inline: 0px !important;
    max-width: calc(100% - var(--tab-indent))!important;
    padding-inline-start: calc( (( ( 3.7 * var(--tab-indent) * var(--tab-indent) * var(--tab-indent) + ( 30 * var(--tab-indent) * var(--tab-indent))) / ( 11 * var(--tab-indent) * var(--tab-indent) + ( 10 * var(--tab-indent)) + 100)) * 1% ) + var(--tab-inner-inline-margin)) !important;
}
#tabbrowser-tabs:not([expanded]) #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper{
      margin-inline: 0px !important;
      justify-items: center!important;
}

@container (min-width: 260px) {
  #tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab-group  > tab,
    #tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] > tab {
        padding-inline-start: calc(var(--tab-indent) * 1px)!important;
    }
  #tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper{
        padding-inline-start: calc(var(--tab-indent) * 1px + var(--tab-inner-inline-margin))!important;
  }
}

#tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper tab:first-child .tab-background {
      margin-inline: 0px !important;
}
#tabbrowser-tabs[expanded] #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper:has(tab[tree-depth="0"]){
   padding-inline-start:var(--tab-inner-inline-margin)!important;
}
#vertical-tabs tab:not(collapsed, [pinned]) {
    margin-bottom: 0px!important;
    padding-block-start: 0px!important;
    padding-block-end: 0px!important;
}
#vertical-tabs tab:not(collapsed, [pinned], [hidden-child], [tabPanel-hidden],[tree-depth="0"]) {
    padding-top: var(--branch-tab-top-margin)!important;
}
#vertical-tabs tab:not([pinned])
  .tab-background {
    margin-block: 0!important;
    min-height:var(--tab-height)!important;
}
#tabbrowser-arrowscrollbox[orient="vertical"]>tab:not(collapsed, [pinned], [tabPanel-hidden])[tree-depth="0"]{
    padding-top: var(--root-tab-top-margin) !important;
    margin-bottom: 0px!important;
}
#tabbrowser-tabs tab-split-view-wrapper{
  padding:0!important;
}
#tabbrowser-arrowscrollbox[orient="vertical"]  tab-split-view-wrapper tab{
  padding:0!important;
}
#tabbrowser-arrowscrollbox[orient="vertical"]  tab-split-view-wrapper tab:not(collapsed, [pinned], [hidden-child], [tabPanel-hidden],[tree-depth="0"]){
  margin-top: var(--branch-tab-top-margin)!important;

}

#tabbrowser-arrowscrollbox[orient="vertical"] {
    /*TOP tab margin from top*/
    tab:not(collapsed, [pinned], [tabPanel-hidden], tab-group tab,tab-split-view-wrapper tab)[tree-depth="0"] {
        padding-top: 6px!important;
    }
    /*Other tabs with zero depth level margin from top*/
    tab-group:not(:has(tab[tabPanel-hidden="true"])) + tab:not(collapsed, [pinned], [tabPanel-hidden], tab-group tab,tab-split-view-wrapper tab)[tree-depth="0"]{
      padding-top: var(--root-tab-top-margin)!important;
    }
    tab:not(collapsed, [pinned], [tabPanel-hidden])[tree-depth="0"]~tab:not(collapsed, [pinned], [tabPanel-hidden],tab-split-view-wrapper tab)[tree-depth="0"] {
        padding-top: var(--root-tab-top-margin) !important;
    }
    tab-split-view-wrapper:not(:has(tab[tabPanel-hidden="true"])) ,
    tab:not(collapsed, [pinned], [tabPanel-hidden]),
    tab-group:not(:has(tab[tabPanel-hidden="true"])){
      + tab-split-view-wrapper tab:not(collapsed, [tabPanel-hidden])[tree-depth="0"]{
        margin-top: var(--root-tab-top-margin) !important;
      }
    }
    tab-group tab-split-view-wrapper + 
    tab:not(collapsed, [pinned], [tabPanel-hidden])[tree-depth="0"]{
      padding-top: var(--root-tab-top-margin) !important;
    }
}
.tab-close-button{
  max-height:var(--tab-height)!important;
  max-width:var(--tab-height)!important;
}
.tab-throbber, .tab-icon-pending, .tab-icon-image, .tab-sharing-icon-overlay, .tab-icon-overlay
{
  max-height:calc( var(--tab-height) - var(--tab-close-button-padding) )!important;
  max-width:calc( var(--tab-height) - var(--tab-close-button-padding) )!important;
  min-height:10px!important;
  min-width:10px!important;
}
/*Tab style */
#vertical-tabs tab {
    --tab-min-height: var(--tab-height) !important;
}
#vertical-tabs tab .tab-label {
    font-size: var(--label-font-size)!important;
}
/*No container line*/
@media -moz-pref("treeTabs.style.hideContainerLine") {
#vertical-tabs .tab-context-line {
    display: none!important;
}
}
/*default favicon loading*/
#vertical-tabs tab[pendingicon="true"] .tab-icon-image {
    opacity: 0!important;
}
/*Close button style */
/* New tab button */
/*No text*/
#vertical-tabs-newtab-button .toolbarbutton-text, #vertical-tabs #tabs-newtab-button .toolbarbutton-text {
    display: none!important;
}
/*fix bug https://bugzilla.mozilla.org/show_bug.cgi?id=1921959 */
#vertical-tabs-newtab-button,
#tabs-newtab-button{
  width: 100%!important;
  margin-inline: 0px!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] 
/*if text enalbed 
#tabs-newtab-button{
  padding-left:  var(--tab-inline-padding)!important;
}
*/
#tabbrowser-arrowscrollbox[orient="vertical"] > #tabbrowser-arrowscrollbox-periphery > #tabs-newtab-button, #vertical-tabs-newtab-button {
  &:hover {
    background-color: transparent!important;
    outline-color: transparent!important;
  }
}
#tabbrowser-arrowscrollbox[orient="vertical"] > #tabbrowser-arrowscrollbox-periphery > #tabs-newtab-button:hover::before, #vertical-tabs-newtab-button:hover::before {
    background-color: var(--tab-background-color-hover);
    outline-color: var(--tab-hover-outline-color);
}
#tabbrowser-arrowscrollbox[orient="vertical"] > #tabbrowser-arrowscrollbox-periphery > #tabs-newtab-button::before, #vertical-tabs-newtab-button::before {
  content:"";
  position: absolute;
  display: block;
  width: calc (100% - var(--tab-inner-inline-margin));
  height:var(--tab-min-height);
  left: var(--tab-inner-inline-margin);
  right: var(--tab-inner-inline-margin);
  border-radius: var(--tab-border-radius);
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
#tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root]:not([hidden-child],[tabPanel-hidden],[nestTab]) .tab-icon-stack::before {
    content: url("chrome://global/skin/icons/arrow-right.svg")!important;
    transform: scaleX(1) scaleY(0.8)!important;
    -moz-context-properties: fill, stroke!important;
    min-width: fit-content!important;
    min-height: 20px!important;
    display: block!important;
    margin-top: 1px!important;
    margin-left: -17px!important;
    fill: black!important;
    background: transparent!important;
    position: absolute!important;
}
@media (prefers-color-scheme: dark) {
  #tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root] .tab-icon-stack::before {
    filter:invert(1);
  }
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[twisted-root]:not([pinned],[nestTab]) {
  .tab-icon-stack {
    margin-left: 17px!important;
  }
  .tab-icon-image {
    margin-left: 0px!important;
  }
}
#tabbrowser-tabs[orient="vertical"]:not([expanded]) tab[twisted-root]:not([pinned],[nestTab]) {
 .tab-icon-stack::before {
    display:none!important;
  }
  .tab-icon-stack {
    margin-left: 0px!important;
    margin-top: 0px!important;
  }
  .tab-icon-image {
    display: inherit!important;
    margin-left: 0px!important;
    margin-inline-start: var(--tab-icon-start)!important;
  }
  .tab-note-icon-overlay{
    inset-inline-end: 0!Important;
    padding: 0!Important;
    top:9px!important;
    margin-left: -6px;
  }
}

@media -moz-pref("treeTabs.style.twistyStyle",2) {
#tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root]:not([hidden-child],[tabPanel-hidden],[nestTab]):hover{
  .tab-icon-image {
     content: url("chrome://global/skin/icons/arrow-right-12.svg")!important;
  }
}
#tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root]:not([hidden-child],[tabPanel-hidden],[nestTab]) .tab-icon-stack::before {
    content: url("chrome://global/skin/icons/resizer.svg")!important;
    transform: scaleX(1.4) scaleY(1)!important;
    transform: scaleX(1.2) scaleY(0.7) rotate(90deg)!important;
    -moz-context-properties: fill, stroke!important;
    min-height: 20px!important;
    display: block!important;
    margin-top: 9px!important;
    margin-left: -8px!important;
    fill: black!important;
    background: transparent!important;
    position: absolute!important;
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[twisted-root]:not([pinned],[nestTab]) {
  .tab-icon-stack {
    margin-left: 0px!important;
  }
  .tab-icon-image {
    margin-left: 0px!important;
    margin-inline-start: var(--tab-icon-start)!important;
  }
}
#tabbrowser-tabs[orient="vertical"]:not([expanded]) tab[twisted-root]:not([pinned],[nestTab]) {
 .tab-icon-stack::before {
    display:none!important;
  }
  .tab-icon-stack {
    margin-left: 0px!important;
    margin-top: 0px!important;
  }
  .tab-icon-image {
    display: inherit!important;
  }
  .tab-note-icon-overlay{
    inset-inline-end: 0!Important;
    padding: 0!Important;
    top:9px!important;
    margin-left: -6px;
  }
}
}

@media -moz-pref("treeTabs.style.twistyStyle",0) {
#tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root]:not([hidden-child],[tabPanel-hidden],[nestTab]):hover{
  .tab-icon-image {
     content: url("chrome://global/skin/icons/arrow-right-12.svg")!important;
  }
}

#tabbrowser-arrowscrollbox[orient="vertical"] tab[twisted-root]:not([hidden-child],[tabPanel-hidden],[nestTab]) .tab-icon-stack::before {
    display:none!important;
    /*
    transform: scaleX(1.3) scaleY(0.9)!important;
    margin-left:14px!important;
    margin-top: 7px!important;
    opacity:0;
    */
}
#tabbrowser-tabs[orient="vertical"][expanded] tab[twisted-root]:not([pinned],[nestTab]) {
  .tab-icon-stack {
    margin-left: 0px!important;
  }
  .tab-icon-image {
    margin-left: 0px!important;
    margin-inline-start: var(--tab-icon-start)!important;
  }
}
#tabbrowser-tabs[orient="vertical"]:not([expanded]) tab[twisted-root]:not([pinned],[nestTab]) {
 .tab-icon-stack::before {
    display:none!important;
  }
  .tab-icon-stack {
    margin-left: 0px!important;
    margin-top: 0px!important;
  }
  .tab-icon-image {
    display: inherit!important;
  }
  .tab-note-icon-overlay{
    inset-inline-end: 0!Important;
    padding: 0!Important;
    top:9px!important;
    margin-left: -6px;
  }
}
}

/* ABSOLUTE CINEMA */
#tabbrowser-arrowscrollbox[orient="vertical"][expanded]{
tab[tree-depth='0']:not([twisted-root]):has(+tab:not([tree-depth='0']),+tab-split-view-wrapper tab:not([tree-depth='0'])),
tab[tree-depth='1']:not([twisted-root]):has(+tab[tree-depth='2'],+tab-split-view-wrapper tab[tree-depth='2']),
tab[tree-depth='2']:not([twisted-root]):has(+tab[tree-depth='3'],+tab-split-view-wrapper tab[tree-depth='3']),
tab[tree-depth='3']:not([twisted-root]):has(+tab[tree-depth='4'],+tab-split-view-wrapper tab[tree-depth='4']),
tab[tree-depth='4']:not([twisted-root]):has(+tab[tree-depth='5'],+tab-split-view-wrapper tab[tree-depth='5']),
tab[tree-depth='5']:not([twisted-root]):has(+tab[tree-depth='6'],+tab-split-view-wrapper tab[tree-depth='6']),
tab[tree-depth='6']:not([twisted-root]):has(+tab[tree-depth='7'],+tab-split-view-wrapper tab[tree-depth='7']),
tab[tree-depth='7']:not([twisted-root]):has(+tab[tree-depth='8'],+tab-split-view-wrapper tab[tree-depth='8']),
tab[tree-depth='8']:not([twisted-root]):has(+tab[tree-depth='9'],+tab-split-view-wrapper tab[tree-depth='9']),
tab[tree-depth='9']:not([twisted-root]):has(+tab[tree-depth='10'],+tab-split-view-wrapper tab[tree-depth='10']){
 .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
  }
}
tab-split-view-wrapper:has(tab[tree-depth='0']:first-child:not([twisted-root])):has(+tab:not([tree-depth='0']),+tab-split-view-wrapper tab:not([tree-depth='0'])),
tab-split-view-wrapper:has(tab[tree-depth='1']:first-child:not([twisted-root])):has(+tab[tree-depth='2'],+tab-split-view-wrapper tab[tree-depth='2']),
tab-split-view-wrapper:has(tab[tree-depth='2']:first-child:not([twisted-root])):has(+tab[tree-depth='3'],+tab-split-view-wrapper tab[tree-depth='3']),
tab-split-view-wrapper:has(tab[tree-depth='3']:first-child:not([twisted-root])):has(+tab[tree-depth='4'],+tab-split-view-wrapper tab[tree-depth='4']),
tab-split-view-wrapper:has(tab[tree-depth='4']:first-child:not([twisted-root])):has(+tab[tree-depth='5'],+tab-split-view-wrapper tab[tree-depth='5']),
tab-split-view-wrapper:has(tab[tree-depth='5']:first-child:not([twisted-root])):has(+tab[tree-depth='6'],+tab-split-view-wrapper tab[tree-depth='6']),
tab-split-view-wrapper:has(tab[tree-depth='6']:first-child:not([twisted-root])):has(+tab[tree-depth='7'],+tab-split-view-wrapper tab[tree-depth='7']),
tab-split-view-wrapper:has(tab[tree-depth='7']:first-child:not([twisted-root])):has(+tab[tree-depth='8'],+tab-split-view-wrapper tab[tree-depth='8']),
tab-split-view-wrapper:has(tab[tree-depth='8']:first-child:not([twisted-root])):has(+tab[tree-depth='9'],+tab-split-view-wrapper tab[tree-depth='9']),
tab-split-view-wrapper:has(tab[tree-depth='9']:first-child:not([twisted-root])):has(+tab[tree-depth='10'],+tab-split-view-wrapper tab[tree-depth='10']){
 tab:first-child .tab-icon-image:hover {
    content: url("chrome://global/skin/icons/arrow-down-12.svg")!important;
  }
}
}
#tabbrowser-arrowscrollbox[orient="vertical"]{
 tab[hidden-child] ,
 tab[hidden-child] *,
 tab[tabPanel-hidden] *::before,
 tab[tabPanel-hidden],
 tab[tabPanel-hidden] *,
 tab-split-view-wrapper:has(>tab[tabPanel-hidden]) {
    max-height: 0px!important;
    min-height: 0px!important;
    margin-block: 0!important;
    margin-top: 0!important;
    margin-block-start: 0!important;
    border:none!important;
    padding: 0!important;
    outline:none!important;
 }
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
        display: none!important;
    }
}
#vertical-pinned-tabs-splitter {
    #pinned-tabs-container:has(tab:not([tabPanel-hidden="true"])) + & {
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

tab-group tab, tab-split-view-wrapper{
  border-left: 2px solid var(--tab-group-line-color)!important;
  border-radius:0px!important;
}
tab-group > tab-split-view-wrapper tab{
  border-left: none!important;
}
tab-group > tab-split-view-wrapper {
 margin-inline-start:var(--space-medium)!important;
}

&:not([expanded])
tab-group > tab-split-view-wrapper
{
 margin-inline:0!important;
}

.tab-group-line{
  display: none!important;
} 
tab[nestTab]{
  .tab-icon-image{
      content: url("chrome://global/skin/icons/folder.svg")!important;
  }
  &[twisted-root]
  .tab-icon-image{
      content:  url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="context-fill"><path d="M1 3.5C1 2.67157 1.67157 2 2.5 2H6L8 4H13.5C14.3284 4 15 4.67157 15 5.5V12.5C15 13.3284 14.3284 14 13.5 14H2.5C1.67157 14 1 13.3284 1 12.5V3.5Z"/></svg>')!important;
     margin-inline-start: var(--tab-icon-start);
  }
}
.tab-group-label {
  margin-block:0!important;
}
.tab-group-label-container {
  #tabbrowser-tabs[orient="vertical"] tab-group:not([collapsed]) > &::after, #tabbrowser-tabs[orient="vertical"] tab-group[collapsed][hasactivetab]:not([movingtabgroup]) > &::after{
    inset-inline: 0px auto!important;
  }
}
@media -moz-pref("treeTabs.style.customGroups") {

.tab-group-label {
  #tabbrowser-tabs[expanded] & {
  max-width:100%!important;
  align-self: unset!important;
  margin-top: 0px!important;
  margin-inline-end:0px!important;
  text-align: left!important;
  border-radius: var(--tab-border-radius-forced)!important;
  text-indent: calc( var(--tab-icon-end-margin) + 16px)!important;
  background-image: url("chrome://global/skin/icons/folder.svg")!important;
  background-size:  clamp(0px, 16px, calc( var(--tab-height) - var(--tab-close-button-padding) )) auto;
  -moz-context-properties: fill, fill-opacity, stroke!important;
  fill: silver!important;
  background-repeat: no-repeat!important;
  background-position: left var(--tab-icon-end-margin) center!important;
  height: var(--tab-height)!important;
  font-size: var(--label-font-size)!important;
  line-height:calc( var(--tab-height) - 1px )!important;
}
}
.tab-group-label-hover-highlight {
  block-size: clamp(0px, 16px, calc( var(--tab-height) - var(--tab-close-button-padding) )) auto!important;
  #tabbrowser-tabs[orient="vertical"][expanded] & {
    margin-inline-end: 0px!important;
  }
}
tab-group[collapsed] .tab-group-label {
  #tabbrowser-tabs[expanded] & {
  margin-inline-end:0!important;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="context-fill"><path d="M1 3.5C1 2.67157 1.67157 2 2.5 2H6L8 4H13.5C14.3284 4 15 4.67157 15 5.5V12.5C15 13.3284 14.3284 14 13.5 14H2.5C1.67157 14 1 13.3284 1 12.5V3.5Z"/></svg>')!important;
  }
}
tab-group[collapsed] .tab-group-label-container {
  #tabbrowser-tabs[expanded] & {
  margin-right:0!important;
  margin-inline-end: var(--tab-inner-inline-margin)!important;
  }
}
.tab-group-label-container {
  #tabbrowser-tabs[expanded] & {
  margin-block-end: 0!Important;
  margin-block-start: var( --root-tab-top-margin)!important;
  margin-right:0!important;
  margin-inline-start: var(--tab-inner-inline-margin)!important;
  margin-inline-end: var(--tab-inner-inline-margin)!important;

  }
}
.tab-group-label-container {
    tab-group:not([collapsed])>&, tab-group[collapsed][hasactivetab]>& {
      #tabbrowser-tabs[expanded] & {
        padding-block-end: var(--group-first-tab-top-margin)!important;
    }
  }
}

@media (prefers-color-scheme: dark) {
    .tab-group-label {
        color: light-dark(var(--tab-group-color-pale), var(--tab-group-color-pale))!important;
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
}
.popup-main-panel{
  max-width: var(--menuitem-max-width);
}
tab:not([hidden-child],[tabPanel-hidden]) .tab-child-count{
  margin-left: -12px !important;
  margin-top: 7px;
  position: absolute;
  font-size: 10px;
}
#tabbrowser-tabs[orient="vertical"]:not([expanded]){
 tab:not([hidden-child],[tabPanel-hidden]) .tab-child-count{
    padding-bottom:0px!important;
  }
}
tab[tabPanel-hidden] .tab-child-count,
tab[hidden-child] .tab-child-count{
  display:none!important;
}
tab:not([hidden-child],[tabPanel-hidden]) .tab-child-count2{
  padding-bottom:2px;
}
#tabbrowser-tabs[orient="vertical"]:not([expanded]){
 tab .tab-child-count2{
    display:none;
  }
}
#tabbrowser-tabs[orient="vertical"][expanded]
tab:not([tab-note],[selected]):hover .tab-child-count2{
  display:none;
}
tab[tabPanel-hidden] .tab-child-count2,
tab[hidden-child] .tab-child-count2{
  display:none!important;
}
#tabbrowser-tabs[orient="vertical"][expanded]
.tab-child-count{
  display:none;
}
tab-split-view-wrapper tab{
   .tab-child-count2{
    display:none!important;
  }
   .tab-child-count{
    display:block!important;
  }
}
tab:not([hidden-child],[tabPanel-hidden])[nestTab] .tab-child-count{
  margin-left: 12px !important;
  margin-top: 7px;
}
#tabbrowser-tabs[orient="vertical"]:not([expanded])
  tab:not([hidden-child],[tabPanel-hidden]) .tab-child-count{
    margin-left: 12px !important;
    margin-top: 7px;
}

@media -moz-pref("treeTabs.style.twistyStyle",0) {
  .tab-child-count2{
    font-size:0px;
    right:0px;
    position: absolute!important;
  }
  .tab-child-count2::before{
    display:none!important;
    content: url("chrome://global/skin/icons/resizer.svg")!important;
    transform: scaleX(1.4) scaleY(1)!important;
    transform: scaleX(1.3) scaleY(0.9)!important;
    -moz-context-properties: fill, stroke!important;
    min-width: fit-content!important;
    min-height: 20px!important;
    display: block!important;
    margin-top: -1px!important;
    margin-left: calc( ( -1 * var(--tab-inner-inline-margin) ) - 18px )!important;
    fill: black!important;
    background: transparent!important;
    position: absolute!important;
  }
  @media (prefers-color-scheme: dark) {
    .tab-child-count2::before{
      filter:invert(1);
    }
  }
  #tabbrowser-tabs[orient="vertical"][expanded]
  tab:not([tab-note],[selected]):hover .tab-child-count2{
    display:inherit!important;
  }
  tab:not([hidden-child],[tabPanel-hidden]) .tab-child-count{
    display:inherit!important;
    margin-left: 12px !important;
    margin-top: 7px;
  }
}

@media -moz-pref("treeTabs.style.twistyStyle",2) {
   tab-split-view-wrapper tab:not([hidden-child],[tabPanel-hidden]) .tab-child-count{
    display:inherit!important;
    margin-left: 12px !important;
    margin-top: 7px;
  }
}

@media not -moz-pref("treeTabs.style.collapsedChildrenCounter") {
  @media not -moz-pref("treeTabs.style.twistyStyle",0) {
    .tab-child-count2{
        opacity:0;
        display:none!important;
    }
  }
 .tab-child-count{
  opacity:0;
    display:none!important;
  }
}

.tab-preview-item{
  max-width:37em;
  -moz-context-properties: fill, stroke;
  fill: currentColor;
}

/*Styling*/
#vertical-tabs tab .tab-background {
    border-radius: var(--tab-border-radius-forced)!important;
}

@media -moz-pref("treeTabs.style.customText") {

  @media (prefers-color-scheme: dark) {
    .tab-label[selected] {
        color: white!important;
    }
    .tab-label:not([selected]) {
        color: color-mix( in srgb, var(--identity-icon-color, rgba(140, 120, 140)) 15%, rgb(230, 230, 230, 0.95));
    }
  }
  .tab-content:not([selected]) {
      filter: brightness(0.98) contrast(0.9);
      opacity: 0.98;
  }
}

@media -moz-pref("treeTabs.style.customBackground") {

@media (prefers-color-scheme: dark) {
  #vertical-tabs tab:not([selected],[hidden-child],[tabPanel-hidden]) .tab-background {
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

  #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper:has([selected]) {
      outline: 0px solid;
      outline-color: rgba(120, 50, 50, 1);
      background: transparent!important;
  }
  #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper:has([selected]) .tab-background:not([selected]) {
      background: transparent!important;
      border: none!important;
  }
  #tabbrowser-tabs tab-split-view-wrapper {
    &:not([hasactivetab]) {
      &:hover{
      background: transparent!important;
    }
  }}
}

@media (prefers-color-scheme: light) {
  #vertical-tabs tab:not([selected],[hidden-child],[tabPanel-hidden]) .tab-background {
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

  #tabbrowser-arrowscrollbox[orient="vertical"] tab-split-view-wrapper:has([selected]) {
      outline: 1px solid;
      outline-color: rgba(120, 50, 50, 0.7);
      background: color-mix( in srgb, rgba(255, 255, 255) 50%, transparent);
  }
}
}

#vertical-tabs tab[nestTab] .tab-background {
   background-color:rgba(100,100,100,0.4)!important;
}
@media (prefers-color-scheme: light) {

  #vertical-tabs tab[nestTab] .tab-background {
    background-color:oklch(0.97 0.05 205)!important;
  }
 #vertical-tabs  tab[nestTab] {
   .tab-icon-image{
   }
   &[twisted-root]{
   .tab-icon-image{
     fill:rgb(180,160,160)!important;
   }
   .tab-background {
      background-color:rgba(190,170,200,0.4)!important;
    }
  }
 }
}

.tab-icon-image {
    #tabbrowser-tabs[orient="vertical"][expanded] tab:not([twisted-root]) &:not([pinned]) {
        margin-inline-start: var(--tab-icon-start);
    }
}
/*Styles unloaded tab from previous Session */  
tab[pending]:not([nestTab],[pinned]) {
  opacity: 0.8!important;
  font-style: italic!important;
}
tab[pending]:not([nestTab],[pinned]) .tab-icon-image {
  opacity: 1!important;
  filter: none!important;
}
@media -moz-pref("browser.nova.enabled") {
  /* Fix Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=2053433 */
  #browser:has(#sidebar-container:not([sidebar-positionend])){
    padding-left:0px!important;
  }
  #sidebar-container:not([sidebar-positionend]){
    border-left-width:0px!important;
  }
  #browser:has(#sidebar-container[sidebar-positionend]{
    padding-right:0px!important;
  }
  #sidebar-container[sidebar-positionend]{
    border-right-width:0px!important;
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

  if (!styleSvc.sheetRegistered(styleURI, styleSvc.AGENT_SHEET)) {
    styleSvc.loadAndRegisterSheet(styleURI, styleSvc.AGENT_SHEET);
  }
  return [styleURI, styleSvc.AGENT_SHEET];
}
