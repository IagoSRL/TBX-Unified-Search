/******* BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Iago Lorenzo Salgueiro <iagosrl@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var unifiedsearch = {

	/* Open a tab launching a global search  */
	openGlobalSearch: function(aSearchedText) {
		// From modules/quickFilterManager.js line 1136:
		//upsell.hidePopup();
		let tabmail = document.getElementById("tabmail");
		tabmail.openTab("glodaFacet", {
						  searcher: new GlodaMsgSearcher(null, aSearchedText)
						});
	},
	/* Reset the filters applied and close the filter bar (like press 'Esc' in quick-filter-box) */
	closeFilter: function(qfbox) {
		//qfbox.value = '';
		// Doble 'Esc' to ensure that the filter bar is closed (when a filter was run a single 'Esc' only clear the box)
		QuickFilterBarMuxer.cmdEscapeFilterStack();
		QuickFilterBarMuxer.cmdEscapeFilterStack();
	},
	/* Reset the filters applied: clean the search string in quick-filter-box and restore the folder view
		qfbox_clearSearch()? */
	resetFilter: function(qfbox) {
		// Mozilla Thunderbird 3.1 Code: modified portions from quickFilterBar.js, line 624, function: cmdEscapeFilterStack
		let filterer = QuickFilterBarMuxer.maybeActiveFilterer;
		if (!filterer || !filterer.visible)
			return;

		// update the search if we were relaxing something
		if (filterer.userHitEscape()) {
			QuickFilterBarMuxer.updateSearch();
			QuickFilterBarMuxer.reflectFiltererState(filterer,
				QuickFilterBarMuxer.tabmail.currentTabInfo.folderDisplay);
		}
	},
	
	/* Launch a Global Search inside the Quick Filter Box, opening the tab with the search and performing another 
		needed tasks (like clear the qfbox and filters after open search) */
	doGlobalSearch: function(qfbox) {
		// Don't search if there is nothing to search:
		if (!qfbox || !qfbox.value || qfbox.value.replace(/^\s+|\s+$/g, '') == '')
			return
		let aSearch = qfbox.value;
		unifiedsearch.resetFilter(qfbox);
		unifiedsearch.openGlobalSearch(aSearch);
	},
	
	filterFromSearchBox: function(gsbox) {
		// get quick filter box
		let quickFilter = document.getElementById("qfb-qs-textbox");
		// only if the text change
		if (quickFilter.value != gsbox.value) {
			// transfer text from global-search to quick-filter box
			quickFilter.value = gsbox.value;
			// do the filter (without delay?!)
			quickFilter.doCommand();
		}
		if (unifiedsearch.options.autoShowFilterBar)
			QuickFilterBarMuxer._showFilterBar(gsbox.value != '');
	},
	
	// load and show autocomplete suggestions from global -gloda- search
	loadSearchAutoComplete: function(gsbox) {
		gsbox.controller.input = gsbox;
		gsbox.controller.startSearch(gsbox.value);
	},
	// load and show autocomplete suggestions from global -gloda- search near to quick filter box
	loadFilterAutoComplete: function(gsbox, qfbox) {
		gsbox.controller.input = gsbox;
		gsbox.controller.startSearch(qfbox.value);
		
		// Study the showPopup function in gsbox.popup
		//for (let ip in gsbox.popup)
		//	Application.console.log("PopUp: " + ip + "=" + gsbox.popup[ip]);
		
		//let popup = document.getElementById("PopupGlodaAutocomplete");
		/*Application.console.log("Popup: " + gsbox.popup.id);
		let st = window.getComputedStyle(qfbox, null);
		gsbox.popup.style.position = "absolute";
		gsbox.popup.style.display = "block";
		gsbox.popup.style.top = qfbox.offsetTop;
		gsbox.popup.style.left = qfbox.offsetLeft;
		Application.console.log("left: " + st.left);
		Application.console.log("pop: " + gsbox.popup.style.position);
		Application.console.log("pop: " + gsbox.popup.style.left);
		Application.console.log("pop: " + gsbox.popup.style.top);*/
	},
	switchSearchAutoComplete: function(gsbox) {
		this.options.enableAutoCompleteInSearchBox = !(gsbox.disableAutoComplete = !gsbox.disableAutoComplete);
		if (!gsbox.disableAutoComplete) {
			// do the search to show autocomplete suggestions (is not auto when set to false 'disableAutoComplete')
			this.loadSearchAutoComplete(gsbox);
			// if autocomplete is enable and filtering enable, filter results must be cleared now
			if (this.options.enableFilteringInSearchBox &&
				this.options.incompatibleFilteringAndAutoComplete)
				if (this.options.autoShowFilterBar)
					unifiedsearch.closeFilter();
				else
					unifiedsearch.resetFilter();
		} else {
			// Hide the autocomplete popup
			gsbox.popup.hidePopup();
			// if autocomplete is disabled and filtering enable, filter must be executed now
			if (this.options.enableFilteringInSearchBox &&
				this.options.incompatibleFilteringAndAutoComplete)
				this.filterFromSearchBox(gsbox);
		}
	},
	/* Really, the autocomplete feature only exits in the global search box, here I try to move this autocomplete
		to be near the filter box to seams be their autocomplete -with global suggestions, of course- */
	switchFilterAutoComplete: function(qfbox) {
		let gsbox = document.getElementById("searchInput");
		this.options.enableAutoCompleteInFilterBox = !this.options.enableAutoCompleteInFilterBox;
		gsbox.disableAutoComplete = !this.options.enableAutoCompleteInFilterBox;
		if (!gsbox.disableAutoComplete) {
			// do the search to show autocomplete suggestions (is not auto when set to false 'disableAutoComplete')
			this.loadFilterAutoComplete(gsbox, qfbox);
		}
	},

	// Quick filter box key handler
	quickFilterBoxHandler: function(aEvent) {
		// 'Control' Modifier
		if (aEvent.ctrlKey) {
			// Press 'Enter'
			if (unifiedsearch.options.searchShortcut_ctrlEnter && 
				aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				unifiedsearch.doGlobalSearch(this);
			}
			// Press 'K' or 'k'
			else if (unifiedsearch.options.enableFilterTransfer &&
					aEvent.keyCode == KeyEvent.DOM_VK_K) {
				// get global search input/textbox
				let globalSearch = document.getElementById("searchInput");
				// transfer text from filter-box to search-box
				globalSearch.value = this.value;
				// load and show autocomplete suggestions from global -gloda- search, if active
				if (!globalSearch.disableAutoComplete)
					unifiedsearch.loadSearchAutoComplete(globalSearch);
				// Reset filter:
				unifiedsearch.resetFilter(this);
				
				// Set the focus over the global-search is not needed (another TB key-handler already do it)
			}
			else if (unifiedsearch.options.autoCompleteShortcut_ctrlA &&
					aEvent.keyCode == KeyEvent.DOM_VK_A) {
				// TODO function code of switchFilterAutoComplete: dificult and maybe unnecessary to implement
				//unifiedsearch.switchFilterAutoComplete(this);
			}
		}
		// 'Alt' Modifier
		else if (aEvent.altKey) {
			if (unifiedsearch.options.searchShortcut_altEnter && 
				aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				unifiedsearch.doGlobalSearch(this);		
			}
			else if (unifiedsearch.options.autoCompleteShortcut_altA &&
					aEvent.keyCode == KeyEvent.DOM_VK_A) {
				// TODO function code of switchFilterAutoComplete: dificult and maybe unnecessary to implement
				//unifiedsearch.switchFilterAutoComplete(this);
			}
		}
		// Without modifiers: Only pressing 'Enter':
		else if (unifiedsearch.options.searchShortcut_enter && 
				aEvent.keyCode == aEvent.DOM_VK_RETURN) {
			unifiedsearch.doGlobalSearch(this);
		}

		unifiedsearch.previousKeyDown = aEvent.keyCode;
	},
	
	// Global search box key handler
	globalSearchBoxHandler: function(aEvent) {
	
		if (aEvent.type == "keyup") {
			// This must be do it in 'keyup' event because in 'keydown' and 'keypress' events the input.value didn't have been processed
			if (unifiedsearch.options.enableFilteringInSearchBox &&
				!aEvent.ctrlKey && !aEvent.altKey && !aEvent.metaKey) {
				
				// Check if filtering must be desactived because autocomplete is enable and are configured like incompatible
				if (unifiedsearch.options.incompatibleFilteringAndAutoComplete &&
					unifiedsearch.options.enableAutoCompleteInSearchBox)
					return;
					
				if (aEvent.keyCode != aEvent.DOM_VK_RETURN)
					unifiedsearch.filterFromSearchBox(this);
			}
		}
		else if (aEvent.type == "keydown") {
			if (aEvent.keyCode == aEvent.DOM_VK_RETURN && 
				unifiedsearch.options.enableFilteringInSearchBox) {
				// If a global search is being executed (press 'Enter' in textbox or selecting a suggestion and press 'Enter'),
				// search box is TB default cleared, but quicksearch box and bar not, do it here!: (in keyup event there are 
				// 'currentTab' problems)
				if (unifiedsearch.options.autoShowFilterBar)
					unifiedsearch.closeFilter();
				else
					unifiedsearch.resetFilter();
			} else if (aEvent.ctrlKey) {
				// Press 'F' or 'f'
				if (unifiedsearch.options.enableSearchTransfer &&
					aEvent.keyCode == KeyEvent.DOM_VK_F) {
					// get quick filter box
					let quickFilter = document.getElementById("qfb-qs-textbox");
					// transfer text from global-search to quick-filter box
					quickFilter.value = this.value;
					//quickFilter.mInputField.value = this.value;
					// do the filter
					quickFilter.doCommand();
					// Reset global:
					this.value = '';
					// Set the focus over the quick-filter. Here must not allow that TB key-handler do it (the text-transfer and the filter will fail)
					quickFilter.focus();
					aEvent.stopPropagation();
					aEvent.preventDefault();
				} else if (unifiedsearch.options.autoCompleteShortcut_ctrlA &&
					aEvent.keyCode == KeyEvent.DOM_VK_A) {
					unifiedsearch.switchSearchAutoComplete(this);
				}
			} else if (aEvent.altKey && 
					unifiedsearch.options.autoCompleteShortcut_altA &&
					aEvent.keyCode == KeyEvent.DOM_VK_A) {
				unifiedsearch.switchSearchAutoComplete(this);
			}
		}
	},
	
	// Observing changes in preferences (nsIObserver)
	observe: function(subject, topic, data) {
		// I'm only interested in preferences values changed
		if (topic != "nsPref:changed") return;

		switch(data)
		{
			case "autoComplete.enableTabScrolling":
				unifiedsearch.configureAutoCompleteTabScrolling();
				break;
			case "autoComplete.enableInSearchBox":
				unifiedsearch.configureAutoCompleteEnableInSearchBox();
				break;
			case "autoComplete.enableInFilterBox":
				unifiedsearch.configureAutoCompleteEnableInFilterBox();
				break;
			case "filterBox.hide":
				unifiedsearch.configureHideFilterBox();
				break;
			case "searchBox.hide":
				unifiedsearch.configureHideSearchBox();
				break;
		}
	},
	
	options: {
		prefs: Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.unifiedsearch."),
		get searchShortcut_altEnter() { return this.prefs.getBoolPref("searchShortcut.altEnter") },
		get searchShortcut_ctrlEnter() { return this.prefs.getBoolPref("searchShortcut.ctrlEnter") },
		get searchShortcut_enter() { return this.prefs.getBoolPref("searchShortcut.enter") },
		get autoComplete_enableTabScrolling() { return this.prefs.getBoolPref("autoComplete.enableTabScrolling") },
		get autoCompleteShortcut_altA() { return this.prefs.getBoolPref("autoCompleteShortcut.altA") },
		get autoCompleteShortcut_ctrlA() { return this.prefs.getBoolPref("autoCompleteShortcut.ctrlA") },
		get enableSearchTransfer() { return this.prefs.getBoolPref("enableSearchTransfer") },
		get enableFilterTransfer() { return this.prefs.getBoolPref("enableFilterTransfer") },
		get enableAutoCompleteInSearchBox() { return this.prefs.getBoolPref("autoComplete.enableInSearchBox") },
		set enableAutoCompleteInSearchBox(val) { this.prefs.setBoolPref("autoComplete.enableInSearchBox", val) },
		get enableAutoCompleteInFilterBox() { return this.prefs.getBoolPref("autoComplete.enableInFilterBox") },
		set enableAutoCompleteInFilterBox(val) { this.prefs.setBoolPref("autoComplete.enableInFilterBox", val) },
		get enableFilteringInSearchBox() { return this.prefs.getBoolPref("searchBox.enableFiltering") },
		get incompatibleFilteringAndAutoComplete() { return this.prefs.getBoolPref("searchBox.incompatibleFilteringAndAutoComplete") },
		get hideFilterBox() { return this.prefs.getBoolPref("filterBox.hide") },
		get hideSearchBox() { return this.prefs.getBoolPref("searchBox.hide") },
		get autoShowFilterBar() { return this.prefs.getBoolPref("filterBar.autoShow") }
	},
	
	/*****************************************************************************************/
	/* Functions to configure elements that depends on initialization or preferences changes */
	configureAutoCompleteTabScrolling: function() {
		document.getElementById("searchInput").tabScrolling = this.options.autoComplete_enableTabScrolling;
	},
	configureAutoCompleteEnableInSearchBox: function() {
		document.getElementById("searchInput").disableAutoComplete = !this.options.enableAutoCompleteInSearchBox;
	},
	configureAutoCompleteEnableInFilterBox: function() {
		// TODO
	},
	configureHideFilterBox: function() {
		let qfbox = document.getElementById("qfb-qs-textbox");
		if (this.options.hideFilterBox)
			qfbox.style.visibility = "collapse";
		else
			qfbox.style.visibility = "visible";
	},
	configureHideSearchBox: function() {
		let gsbox = document.getElementById("searchInput");
		if (this.options.hideSearchBox)
			gsbox.style.visibility = "collapse";
		else
			gsbox.style.visibility = "visible";
	},
	
	/* Initializing Unified Search */
	startup: function (aEvent) {
		// Observer changes in preferences
		this.options.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this.options.prefs.addObserver("", this, false);
	
		// Attach key handlers
		document.getElementById("qfb-qs-textbox").addEventListener(
        "keydown", this.quickFilterBoxHandler, false);
		document.getElementById("searchInput").addEventListener(
        "keydown", this.globalSearchBoxHandler, false);
		document.getElementById("searchInput").addEventListener(
        "keyup", this.globalSearchBoxHandler, false);

		// Configure all needed:
		this.configureAutoCompleteTabScrolling();
		this.configureAutoCompleteEnableInSearchBox();
		this.configureAutoCompleteEnableInFilterBox();
		this.configureHideFilterBox();
		this.configureHideSearchBox();
	},
	shutdown: function (aEvent) {
		this.options.prefs.removeObserver("", this);
	},
	
	// Events handlers wrappers for load and unload the extension (to avoid problems with 'this' reference)
	onLoad: function (aEvent) { unifiedsearch.startup(aEvent) },
	onUnLoad: function (aEvent) { unifiedsearch.shutdown(aEvent) }
}
window.addEventListener("load", unifiedsearch.onLoad, false);
window.addEventListener("unload", unifiedsearch.onUnLoad, false);
