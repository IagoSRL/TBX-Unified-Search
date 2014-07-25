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
 * The Original Code is Unified Search.
 *
 * The Initial Developer of the Original Code is
 * Iago Lorenzo Salgueiro <iagosrl@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

	/**** Modifing behavior of some built-in Thunderbird functions ****/
	modTBBuiltIn: function US_modTBBuiltIn() {
		// showFilterBar: I save this function with another similar name to reuse it in the new implementation
		// that raise an unifiedsearch function to mantain the uswidget synchronized with the TBQFBar.
		QuickFilterBarMuxer.__original_showFilterBar = QuickFilterBarMuxer._showFilterBar;
		QuickFilterBarMuxer._showFilterBar = function US_QFBM__showFilterBar(aShow) {
			this.__original_showFilterBar(aShow);
			if (!aShow) unifiedsearch.clearAllFilteringOptions();
		};
		// onTabRestored: I save this function with another similar name to reuse it in the new implementation
		// that raise an unifiedsearch function to mantain the uswidget synchronized with the TBQFBar (specially,
		// the 'search text' into the usbox after start thunderbird and restore the session state at TBQFBar-box).
		// An extra feature allow disable the 'restore' system with a non-standar method (avoiding call the 
		// orginal function ;-).
		QuickFilterBarMuxer.__original_onTabRestored = QuickFilterBarMuxer.onTabRestored;
		QuickFilterBarMuxer.onTabRestored = function US_QFBM_onTabRestored(aTab, aState, aFirstTab) {
			if (unifiedsearch.options.rememberFilterOptions)
				this.__original_onTabRestored(aTab, aState, aFirstTab);
			unifiedsearch.synchronizeFilterTextWithUnifiedSearchBox();
			unifiedsearch.synchronizeFilterTextWithSearchBox();
		};
		QuickFilterBarMuxer.__original_cmdEscapeFilterStack = QuickFilterBarMuxer.cmdEscapeFilterStack;
		QuickFilterBarMuxer.cmdEscapeFilterStack = function US_QFBM_cmdEscapeFilterstack() {
			let filterer = this.maybeActiveFilterer;
			if (!filterer) // I remove this ;-) // || !filterer.visible)
			  return;

			unifiedsearch.resetUSWFilter(); // And I add this one.

			// update the search if we were relaxing something
			if (filterer.userHitEscape()) {
			  this.updateSearch();
			  this.reflectFiltererState(filterer,
										this.tabmail.currentTabInfo.folderDisplay);
			}
			// close the filter since there was nothing left to relax
			else {
			  this.cmdClose();
			}
		};
		// Try to solve Bug 582576: filter options are not reseted when switch from a folder to account folder and go again
		// to the same folder.
		// Original handler for event onMakeActive is saved; their purpose is hide/show QFBar and QFBar-show-button when
		// switch between normal folders and account folders.
		// New version will try reset state when persist is off and apply the filter when persist is on
		QuickFilterBarMuxer.__original_onMakeActive = QuickFilterBarMuxer.onMakeActive;
		QuickFilterBarMuxer.onMakeActive = function US_QFBM_onMakeActive(aFolderDisplay, aWasInactive) {
			this.__original_onMakeActive(aFolderDisplay, aWasInactive);
			// The case in that previous aFolderDisplay is showing a normal folder is handled succesfully by onLoadingFolder,
			// here will hand only when previous aFolderDisplay shows an account folder instead (this cannot be do it in onLoadingFolder
			// because that event is not raised).
			// Check if we are in a non-folder:
			let isNotFolder = !aFolderDisplay.displayedFolder || aFolderDisplay.displayedFolder.isServer;
			if (isNotFolder) {
				let filterer = QuickFilterBarMuxer.maybeActiveFilterer;
				if (!filterer) return;
				// Reset displayedFolder will force next onLoadingFolder to recreate the view
				filterer.displayedFolder = null;
			}
		};
	},

	/*** Unified Search Operations Functions ***/
	/* Open a tab launching a global search  */
	openGlobalSearch: function(aSearchedText) {
		// From modules/quickFilterManager.js line 1136:
		//upsell.hidePopup();
		this.tabmail.openTab('glodaFacet', {
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
		//this.logObject(filterer);
		if (!filterer) // || !filterer.visible)
			return;

		// update the search if we were relaxing something
		if (filterer.userHitEscape()) {
			QuickFilterBarMuxer.updateSearch();
			QuickFilterBarMuxer.reflectFiltererState(filterer,
				QuickFilterBarMuxer.tabmail.currentTabInfo.folderDisplay);
		}
	},
	/* To replace 'resetFilter' that use the triple-Esc behavior to reset all values, we do here a manual reset of all QuickFilterBar options
		just like in resetUSWFilter()
	 */
	resetQFBFilter: function(resetQsToo) {
		if (!this.qfbox || !this.qfbar) return;
		this.qfbox.value = '';
		
		let sticky = document.getElementById('qfb-sticky');

		if(sticky)
			sticky.checked = false;
		this.resetQFBFilterOption('unread');
		this.resetQFBFilterOption('starred');
		this.resetQFBFilterOption('inaddrbook');
		this.resetQFBFilterOption('tags');
		this.resetQFBFilterOption('attachment');
		if(resetQsToo){
			this.resetQFBFilterOption('qs-sender');
			this.resetQFBFilterOption('qs-recipients');
			this.resetQFBFilterOption('qs-subject');
			this.resetQFBFilterOption('qs-body');
		}
		// Option widgets are reseted, but the internal filterer must be updated to avoid state restore and filtered results de-synched.
		let filterer = QuickFilterBarMuxer.maybeActiveFilterer;
		if (filterer)
			filterer.clear();
		QuickFilterBarMuxer.updateSearch();
	},
	logStatusQFBFilterOptions: function(){
		let ops = ['unread', 'starred', 'inaddrbook', 'tags', 'attachment'];
		for (let opsi = 0; opsi < ops.length; opsi++)
			unifiedsearch.log('resetQFBFilter end, ' + ops[opsi] + '.checked = ' + document.getElementById('qfb-' + ops[opsi]).checked);
	},
	resetQFBFilterOption: function(optionName) {
		document.getElementById('qfb-' + optionName).checked = false;
	},
	/* Reset all the controls in the unified search widget to avoid filter 
		This means that, if is in search mode, text is not reset but filter options are ever reset.
	*/
	resetUSWFilter: function(resetQsToo) {
		if (!this.usbox || !this.uswidget) return;
		if (this.uswidget.uswmode == 'filter')
			this.usbox.value = '';
			
		// Hide results popup:
		this.toggleUnifiedSearchResults(false);

		let sticky = document.getElementById('unifiedsearch-widget-sticky');
		// TODO: Investigar por qué, al pulsar Esc se ejecuta varias veces ésta función
		//this.log('resetUSWFilter, sticky: ' + sticky.checked);
		if(sticky)
			sticky.checked = false;
		// Reset USMenu elements only, because USBar elements are observing this (and will be auto updated):
		this.resetUSWFilterOption('unread');
		this.resetUSWFilterOption('starred');
		this.resetUSWFilterOption('inaddrbook');
		this.resetUSWFilterOption('tags');
		this.resetUSWFilterOption('attachment');
		if(resetQsToo){
			this.resetUSWFilterOption('qs-sender');
			this.resetUSWFilterOption('qs-recipients');
			this.resetUSWFilterOption('qs-subject');
			this.resetUSWFilterOption('qs-body');
		}
	},
	resetUSWFilterOption: function(optionName) {
		/*let opt = document.getElementById('unifiedsearch-widget-menu-' + optionName);
		if(opt && opt.checked)
			opt.doCommand();*/
		document.getElementById('unifiedsearch-widget-menu-' + optionName).checked = false;
		document.getElementById('unifiedsearch-widget-bar-' + optionName).checked = false;
		// TODO: Investigate: With the new changes in synchro, events and new function resetQFBFilter, really next line is needed?
		document.getElementById('qfb-' + optionName).checked = false;
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
	
	doGlobalSearchFromUnifiedBox: function(aEvent, usbox) {
		unifiedsearch.closeUnifiedSearchOptionsPopup();
		unifiedsearch.doGlobalSearch(usbox);
		usbox.value = '';
	},
	
	filterFromSearchBox: function(gsbox) {
		// If quick filter box don't exists, there are nothing to do: exit.
		if (!this.qfbox) return;
		// only if the text change
		if (this.qfbox.value != gsbox.value) {
			// transfer text from global-search to quick-filter box
			this.qfbox.value = gsbox.value;
			// do the filter (without delay?!)
			this.qfbox.doCommand();
		}
		if (unifiedsearch.options.autoShowFilterBar)
			QuickFilterBarMuxer._showFilterBar(gsbox.value != '');
	},
	/* modified version of filterFromSearchBox (this have not 'autoShowFilterbar') */
	// The second optional parameter is for cases that the refresh of the filter status is required wherever
	// if the currents values of both boxes are equal (doCommand, the filter, will be executed yes or yes)
	filterFromUnifiedSearchBox: function(usbox, forcedRefresh) {
		// If quick filter box don't exists, there are nothing to do: exit.
		if (!this.qfbox) return;
		// only if the text change
		if (this.qfbox.value != usbox.value || forcedRefresh) {
			// transfer text from global-search to quick-filter box
			this.qfbox.value = usbox.value;
			// do the filter (without delay?!)
			this.qfbox.doCommand();
		}
	},
	
	// load and show autocomplete suggestions from global -gloda- search
	loadSearchAutoComplete: function(gsbox) {
		gsbox.controller.input = gsbox;
		gsbox.controller.startSearch(gsbox.value);
	},
	// load and show autocomplete suggestions from global -gloda- search near to quick filter box
	loadFilterAutoComplete: function(gsbox, qfbox) {
		//TODO:WONTFIX: Not fully implemented, don't used, and maybe innecesary
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
					this.closeFilter();
				else
					this.resetFilter();
		} else {
			// Hide the autocomplete popup
			gsbox.popup.hidePopup();
			// if autocomplete is disabled and filtering enable, filter must be executed now
			if (this.options.enableFilteringInSearchBox &&
				this.options.incompatibleFilteringAndAutoComplete)
				this.filterFromSearchBox(gsbox);
		}
	},
	/* Switch the current active mode by the another: if 'filter' set 'search', if 'search' set 'filter' */
	switchUnifiedSearchAutoComplete: function(usbox) {
		if (!usbox) usbox = this.usbox; // crazy? Not, I must review Why the param.
		if (!this.uswidget || !usbox) return;

		// Lock change if filter was disabled
		if (!this.uswidget.uswcanfilter &&
			this.options.unifiedSearchWidgetMode == 'search')
			return;

		// What is the current mode? then, change it!
		switch(this.options.unifiedSearchWidgetMode){
			default:
			case 'filter':
				// Switch to Search mode:
				this.options.unifiedSearchWidgetMode = 'search';
				usbox.disableAutoComplete = false;
				this.uswidget.uswmode = 'search';
				
				// Prepare search:
				// do the search to show autocomplete suggestions (is not auto when set to false 'disableAutoComplete')
				this.loadSearchAutoComplete(usbox);
				// Filter results must be cleared now
				this.resetFilter();
				// if the options mode bar is active and showed, close it
				if (this.options.uswOptionsMode == 'bar')
					unifiedsearch.hideUnifiedSearchBar();
				break;
			case 'search':
				// Switch to Filter mode:
				this.options.unifiedSearchWidgetMode = 'filter';
				usbox.disableAutoComplete = true;
				this.uswidget.uswmode = 'filter';
				
				// Prepare filter:
				// Hide the autocomplete popup
				usbox.popup.hidePopup();
				// Filter must be executed now
				this.filterFromUnifiedSearchBox(usbox, true);
				// if the options mode bar is active, must be showed now:
				if (this.options.uswOptionsMode == 'bar')
					unifiedsearch.openUnifiedSearchBar();
				break;
		}
	},
	/* Really, the autocomplete feature only exits in the global search box, here I try to move this autocomplete
		to be near the filter box to seams be their autocomplete -with global suggestions, of course- */
	switchFilterAutoComplete: function(qfbox) {
		//TODO:WONTFIX: Not fully implemented, don't used, and maybe innecesary
		if (!gsbox) return;
		this.options.enableAutoCompleteInFilterBox = !this.options.enableAutoCompleteInFilterBox;
		this.gsbox.disableAutoComplete = !this.options.enableAutoCompleteInFilterBox;
		if (!this.gsbox.disableAutoComplete) {
			// do the search to show autocomplete suggestions (is not auto when set to false 'disableAutoComplete')
			this.loadFilterAutoComplete(gsbox, qfbox);
		}
	},
	/* Reset all filtering options from all widgets with do filtering tasks:
		- QFBar
		- USWidget in filter mode
		- GSBox in filter mode
		Set filter texts to empty and flags to 'false'.
	*/
	clearAllFilteringOptions: function() {
		// Reset manually Quick Filter Bar options:
		this.resetQFBFilter();
		// Reset manually Unified Search Widget options:
		this.resetUSWFilter();
		// Adding support for standard global search box too, if have filtering enabled
		if (this.gsbox && this.options.enableFilteringInSearchBox) this.gsbox.value = '';
		//this.synchronizeFilterTextWithSearchBox();
	},
	/* Clear all options and text in Unified Search Widget, whatever mode that is active
	*/
	clearUnifiedSearchWidget: function() {
		// Clear filtering options, from USW and another widgets to mantain sync:
		this.clearAllFilteringOptions();
		// Clear USBox text (because, if is in search mode, previous function will not clear the text)
		if (this.usbox) this.usbox.value = '';
	},
	
	/* Unified search Widget control methods */
	openUnifiedSearchBar: function(aEvent) {
		// The click must be do it directly in the text box, not in anyone button!
		if (aEvent && aEvent.explicitOriginalTarget.id != this.usbox.id)
			return;
	
		let usb = document.getElementById('unifiedsearch-widget-bar');
		let criteria = document.getElementById('unifiedsearch-widget-criteria');
		if (!usb || !criteria) return;

		if (usb.state != 'open' && usb.state != 'showing') {
			usb.openPopup(criteria, usb.getAttribute('position'), 0, 0, false, false);
		}
	},
	hideUnifiedSearchBar: function() {
		let usb = document.getElementById('unifiedsearch-widget-bar');
		if (!usb) return;
		if (usb.state != 'closed' && usb.state != 'hiding')
			usb.hidePopup();
	},
	openUnifiedSearchOptionsPopup: function() {
		if (!this.uswidget) return;
		let criteria = document.getElementById('unifiedsearch-widget-criteria');
		switch(this.options.uswOptionsMode){
			case 'bar':
				let uswbar = document.getElementById('unifiedsearch-widget-bar');
				uswbar.openPopup(criteria, uswbar.getAttribute('position'), 0, 0, false, false);
				break;
			default:
			case 'menu':
				let uswmenu = document.getElementById('unifiedsearch-widget-menu');
				uswmenu.openPopup(criteria, uswmenu.getAttribute('position'), 0, 0, false, false);
				break;
		}
	},
	closeUnifiedSearchOptionsPopup: function() {
		if (!this.uswidget) return;
		document.getElementById('unifiedsearch-widget-' + this.options.uswOptionsMode).hidePopup();
	},
	uswInfoClear: function() {
		let info = document.getElementById('unifiedsearch-widget-info');
		if(!info) return;
		info.hidePopup();
	},
	uswInfoAboutSearch: function() {
		let info = document.getElementById('unifiedsearch-widget-info');
		if(!info || !this.usbox) return;
		info.openPopup(this.usbox, info.getAttribute('position'), 0, 0, false, false);
	},

	// Quick filter box key handler
	quickFilterBoxHandler: function(aEvent, qfbox) {
		if (aEvent.type == 'keyup') {
			if (!aEvent.ctrlKey && !aEvent.altKey && !aEvent.metaKey && 
				aEvent.keyCode != aEvent.DOM_VK_RETURN) {
				// Update Filter text in unifiesearch-box
				if (this.usbox &&
					this.options.unifiedSearchWidgetMode == 'filter')
					this.usbox.value = qfbox.value;
				// Update Filter text in globalsearch-box
				if (this.gsbox && unifiedsearch.options.enableFilteringInSearchBox &&
					!(unifiedsearch.options.enableAutoCompleteInSearchBox &&
					unifiedsearch.options.incompatibleFilteringAndAutoComplete))
					this.gsbox.value = qfbox.value;
			}
		} else if (aEvent.type == 'keydown') {
			// 'Control' Modifier
			if (aEvent.ctrlKey) {
				// Press 'Enter'
				if (unifiedsearch.options.searchShortcut_ctrlEnter && 
					aEvent.keyCode == aEvent.DOM_VK_RETURN) {
					unifiedsearch.doGlobalSearch(qfbox);
				}
				// Press 'K' or 'k'
				else if (unifiedsearch.options.enableFilterTransfer &&
						aEvent.keyCode == KeyEvent.DOM_VK_K) {
					// If global search box don't exists, there are nothing to do: exit.
					if (!this.gsbox) return;
					// transfer text from filter-box to search-box
					this.gsbox.value = qfbox.value;
					// load and show autocomplete suggestions from global -gloda- search, if active
					if (!this.gsbox.disableAutoComplete)
						unifiedsearch.loadSearchAutoComplete(this.gsbox);
					// Reset filter:
					unifiedsearch.resetFilter(qfbox);
					
					// Set the focus over the global-search is not needed (another TB key-handler already do it)
				}
				else if (unifiedsearch.options.autoCompleteShortcut_ctrlA &&
						aEvent.keyCode == KeyEvent.DOM_VK_A) {
					// TODO:WONTFIX function code of switchFilterAutoComplete: dificult and maybe unnecessary to implement
					//unifiedsearch.switchFilterAutoComplete(this);
				}
			}
			// 'Alt' Modifier
			else if (aEvent.altKey) {
				if (unifiedsearch.options.searchShortcut_altEnter && 
					aEvent.keyCode == aEvent.DOM_VK_RETURN) {
					unifiedsearch.doGlobalSearch(qfbox);		
				}
				else if (unifiedsearch.options.autoCompleteShortcut_altA &&
						aEvent.keyCode == KeyEvent.DOM_VK_A) {
					// TODO:WONTFIX function code of switchFilterAutoComplete: dificult and maybe unnecessary to implement
					//unifiedsearch.switchFilterAutoComplete(this);
				}
			}
			// Without modifiers: Only pressing 'Enter':
			else if (unifiedsearch.options.searchShortcut_enter && 
					aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				unifiedsearch.doGlobalSearch(qfbox);
			}
		}
	},
	
	// Global search box key handler
	globalSearchBoxHandler: function(aEvent, gsbox) {

		if (aEvent.type == 'keyup') {
			// This must be do it in 'keyup' event because in 'keydown' and 'keypress' events the input.value didn't have been processed
			if (unifiedsearch.options.enableFilteringInSearchBox &&
				!aEvent.ctrlKey && !aEvent.altKey && !aEvent.metaKey &&
				aEvent.keyCode != aEvent.DOM_VK_RETURN) {
				
				// Check if filtering must be desactived because autocomplete is enable and are configured like incompatible
				if (unifiedsearch.options.incompatibleFilteringAndAutoComplete &&
					unifiedsearch.options.enableAutoCompleteInSearchBox)
					return;
					
				unifiedsearch.filterFromSearchBox(gsbox);
				// Update Filter text in unifiesearch-box too
				if (this.qfbox && this.usbox &&
					this.options.unifiedSearchWidgetMode == 'filter')
					this.usbox.value = this.qfbox.value;
			}
		}
		else if (aEvent.type == 'keydown') {

			if (aEvent.keyCode == aEvent.DOM_VK_RETURN && 
				this.options.enableFilteringInSearchBox) {
				// If a global search is being executed (press 'Enter' in textbox or selecting a suggestion and press 'Enter'),
				// search box is TB default cleared, but quicksearch box and bar not, do it here!: (in keyup event there are 
				// 'currentTab' problems)
				if (this.options.autoShowFilterBar)
					this.closeFilter();
				else
					this.resetFilter();
			} else if (aEvent.ctrlKey) {
				// Press 'F' or 'f'
				if (this.options.enableSearchTransfer &&
					aEvent.keyCode == KeyEvent.DOM_VK_F) {
					// If quick filter box don't exists, there are nothing to do: exit.
					if (!this.qfbox) return;
					// transfer text from global-search to quick-filter box
					this.qfbox.value = gsbox.value;
					//quickFilter.mInputField.value = this.value;
					// do the filter
					this.qfbox.doCommand();
					// Reset global:
					gsbox.value = '';
					// Set the focus over the quick-filter. Here must not allow that TB key-handler do it (the text-transfer and the filter will fail)
					this.qfbox.focus();
					// If global box will filter and autoShowFilterBar is enable, open the bar to show it!
					if (this.options.enableFilteringInSearchBox && this.options.autoShowFilterBar)
						QuickFilterBarMuxer._showFilterBar(true);
						
					aEvent.stopPropagation();
					aEvent.preventDefault();
				} else if (unifiedsearch.options.autoCompleteShortcut_ctrlA &&
					aEvent.keyCode == KeyEvent.DOM_VK_A) {
					unifiedsearch.switchSearchAutoComplete(gsbox);
				}
			} else if (aEvent.altKey && 
					unifiedsearch.options.autoCompleteShortcut_altA &&
					aEvent.keyCode == KeyEvent.DOM_VK_A) {
				unifiedsearch.switchSearchAutoComplete(gsbox);
			}
		}
	},
	
	/* Unified Search Widget Box (usbox in uswidget) Key events handler.
	 * Is a mix of globalSearch and quickFilter handlers with modifications.
	 */
	unifiedSearchBoxHandler: function(aEvent, usbox) {
		if (aEvent.type == 'keyup') {
			// This must be do it in 'keyup' event because in 'keydown' and 'keypress' events the input.value didn't have been processed
			if (!aEvent.ctrlKey && !aEvent.altKey && !aEvent.metaKey &&
				aEvent.keyCode != aEvent.DOM_VK_RETURN) {
				// Must be in 'filter' mode:
				if (this.options.unifiedSearchWidgetMode == 'filter') {
					this.filterFromUnifiedSearchBox(usbox);
					
					this.uswInfoClear();
					
					// Update Filter text in globalsearch-box too
					if (this.qfbox && this.gsbox && unifiedsearch.options.enableFilteringInSearchBox &&
						!(this.options.enableAutoCompleteInSearchBox &&
						this.options.incompatibleFilteringAndAutoComplete))
						this.gsbox.value = this.qfbox.value;
				}
			}
			// Each change must check if clear button needs be showed or hidded:
			unifiedsearch.toggleUnifiedSearchClearButton();
		}
		else if (aEvent.type == 'keydown') {

			if (aEvent.ctrlKey) {
				// Intercambiar filtrado/autocompletado-búsqueda:
				if (/*unifiedsearch.options.autoCompleteShortcut_ctrlA &&*/
					aEvent.keyCode == KeyEvent.DOM_VK_A)
					unifiedsearch.switchUnifiedSearchAutoComplete(usbox);
				// Focus to Thread area:
				else if (aEvent.keyCode == KeyEvent.DOM_VK_T) 
					unifiedsearch.cmd_threadFocus(aEvent);
				/* Testing code:: las funciones funcionan, pero el atajo Control+Mayus+F ya existe y lanza la ventana de filtros, el otro funciona
					pero habría que buscar algo más uniforme entre todas las opciones
				else if (aEvent.shiftKey) {
					// Focus to Message area:
					if (aEvent.keyCode == KeyEvent.DOM_VK_M)
						unifiedsearch.cmd_messageFocus(aEvent);
					// Focus to Folders area:
					else if (aEvent.keyCode == KeyEvent.DOM_VK_F)
						unifiedsearch.cmd_foldersFocus(aEvent);
				}*/
			}
			/*else if (aEvent.altKey) {
				if (unifiedsearch.options.autoCompleteShortcut_altA &&
					aEvent.keyCode == KeyEvent.DOM_VK_A) {
					unifiedsearch.switchUnifiedSearchAutoComplete(usbox);
				}
			}*/
			// Without modifiers:
			else if (aEvent.keyCode == aEvent.DOM_VK_DOWN)
				this.openUnifiedSearchOptionsPopup();
			else if (aEvent.keyCode == aEvent.DOM_VK_UP)
				this.closeUnifiedSearchOptionsPopup();
			else if (aEvent.keyCode == aEvent.DOM_VK_ESCAPE)
				QuickFilterBarMuxer.cmdEscapeFilterStack();
		}
		// Do Search on *maybe something plus* 'Enter'; ever in keypress in bubble phase (fail in capturing phase)
		else if (aEvent.type == 'keypress') {
			// Press Control + 'Enter': search
			if (aEvent.ctrlKey && /*this.options.searchShortcut_ctrlEnter && */
					aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				this.doGlobalSearchFromUnifiedBox(aEvent, usbox);
				aEvent.preventDefault();
				aEvent.stopPropagation();
			}
			// Press Alt + 'Enter': search
			/*else if (aEvent.altKey && this.options.searchShortcut_altEnter && 
					aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				this.doGlobalSearchFromUnifiedBox(aEvent, usbox);
				aEvent.preventDefault();
				aEvent.stopPropagation();
			}*/
			// Press 'Enter' without modifiers (only in 'global search' mode):
			else if (aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				if (this.options.unifiedSearchWidgetMode == 'search'){
					this.doGlobalSearchFromUnifiedBox(aEvent, usbox);
					aEvent.preventDefault();
					aEvent.stopPropagation();
				} else
					this.uswInfoAboutSearch();
			}
		}
		/* Handlers that affect the uswidget popup options (vertical menu and horizontal bar) */
		else if (aEvent.type == 'focus') {
			// open popup with options:
			if (this.options.uswOptionsMode == 'bar' && this.options.unifiedSearchWidgetMode == 'filter')
				this.openUnifiedSearchBar(aEvent);
			// Select the content:
			usbox.select();
        // Show the tooltip:
        this.toggleUnifiedSearchResults();
		}
		else if (aEvent.type == 'click') {
			if (this.options.uswOptionsMode == 'bar' && this.options.unifiedSearchWidgetMode == 'filter')
				this.openUnifiedSearchBar(aEvent);
		}
		else if (aEvent.type == 'blur') {
			if (this.options.uswOptionsMode == 'bar')
				this.hideUnifiedSearchBar(aEvent);
			this.uswInfoClear();
            // Force hide the tooltip:
            this.toggleUnifiedSearchResults(false);
		}
	},
	
	// Observing changes in preferences (nsIObserver)
	observe: function(subject, topic, data) {
		switch (topic) {
			// Preferences values that changed
			case 'nsPref:changed':
				switch (data)
				{
					case 'extensions.unifiedsearch.autoComplete.enableTabScrolling':
						unifiedsearch.configureAutoCompleteTabScrolling();
						break;
					case 'extensions.unifiedsearch.autoComplete.enableInSearchBox':
						unifiedsearch.configureAutoCompleteEnableInSearchBox();
						break;
					case 'extensions.unifiedsearch.unifiedSearchWidget.mode':
						unifiedsearch.configureAutoCompleteEnableInUnifiedSearchBox();
						break;
					case 'extensions.unifiedsearch.autoComplete.enableInFilterBox':
						unifiedsearch.configureAutoCompleteEnableInFilterBox();
						break;
					case 'extensions.unifiedsearch.filterBox.hide':
						unifiedsearch.configureHideFilterBox();
						break;
					case 'extensions.unifiedsearch.filterBar.hide':
						unifiedsearch.configureHideFilterBar();
						break;
					case 'extensions.unifiedsearch.searchBox.hide':
					case 'mailnews.database.global.indexer.enabled':
					case 'extensions.unifiedsearch.searchBox.enableFiltering':
						unifiedsearch.configureHideSearchBox();
						break;
					case 'extensions.unifiedsearch.widget.optionsMode':
						unifiedsearch.configureUnifiedSearchOptionsMode();
						break;
				}
				break;
		}
	},
	
	options: {
		prefs: Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch('extensions.unifiedsearch.'),
		get searchShortcut_altEnter() { return this.prefs.getBoolPref('searchShortcut.altEnter') },
		get searchShortcut_ctrlEnter() { return this.prefs.getBoolPref('searchShortcut.ctrlEnter') },
		get searchShortcut_enter() { return this.prefs.getBoolPref('searchShortcut.enter') },
		get autoComplete_enableTabScrolling() { return this.prefs.getBoolPref('autoComplete.enableTabScrolling') },
		get autoCompleteShortcut_altA() { return this.prefs.getBoolPref('autoCompleteShortcut.altA') },
		get autoCompleteShortcut_ctrlA() { return this.prefs.getBoolPref('autoCompleteShortcut.ctrlA') },
		get enableSearchTransfer() { return this.prefs.getBoolPref('enableSearchTransfer') },
		get enableFilterTransfer() { return this.prefs.getBoolPref('enableFilterTransfer') },
		get enableAutoCompleteInSearchBox() { return this.prefs.getBoolPref('autoComplete.enableInSearchBox') },
		set enableAutoCompleteInSearchBox(val) { this.prefs.setBoolPref('autoComplete.enableInSearchBox', val) },
		//get enableAutoCompleteInUnifiedSearchBox() { return this.prefs.getBoolPref('autoComplete.enableInUnifiedSearchBox') },
		//set enableAutoCompleteInUnifiedSearchBox(val) { this.prefs.setBoolPref('autoComplete.enableInUnifiedSearchBox', val); return val; },
		get enableAutoCompleteInFilterBox() { return this.prefs.getBoolPref('autoComplete.enableInFilterBox') },
		set enableAutoCompleteInFilterBox(val) { this.prefs.setBoolPref('autoComplete.enableInFilterBox', val) },
		get enableFilteringInSearchBox() { return this.prefs.getBoolPref('searchBox.enableFiltering') },
		get incompatibleFilteringAndAutoComplete() { return this.prefs.getBoolPref('searchBox.incompatibleFilteringAndAutoComplete') },
		get hideFilterBox() { return this.prefs.getBoolPref('filterBox.hide') },
		get hideFilterBar() { return this.prefs.getBoolPref('filterBar.hide') },
		get hideSearchBox() { return this.prefs.getBoolPref('searchBox.hide') },
		get autoShowFilterBar() { return this.prefs.getBoolPref('filterBar.autoShow') },
		get rememberFilterOptions() { return this.prefs.getBoolPref('filterBar.rememberFilterOptions') },
		get uswOptionsMode() { 
			let val = this.prefs.getComplexValue('widget.optionsMode', Components.interfaces.nsISupportsString).toString();
			// Avoiding bad configuration: if a non-valid options was setted, 'menu' is returned as default:
			return val != 'bar' ? 'menu' : 'bar';
		},
		set uswOptionsMode(val) {
			let str = Components.classes['@mozilla.org/supports-string;1'].createInstance(Components.interfaces.nsISupportsString);
			str.data = val;
			this.prefs.setComplexValue('widget.optionsMode', Components.interfaces.nsISupportsString, str);
			return val;
		},
		get unifiedSearchWidgetMode() {
			let val = this.prefs.getComplexValue('unifiedSearchWidget.mode', Components.interfaces.nsISupportsString).toString() 
			// Avoiding bad configuration: if a non-valid options was setted, 'filter' is returned as default:
			return val != 'search' ? 'filter' : 'search';
		},
		set unifiedSearchWidgetMode(val) { 
			let str = Components.classes['@mozilla.org/supports-string;1'].createInstance(Components.interfaces.nsISupportsString);
			str.data = val;
			this.prefs.setComplexValue('unifiedSearchWidget.mode', Components.interfaces.nsISupportsString, str);
			return val;
		},
		
		/**** The options with the prefix 'app_' in the name, are preferences of the 
				application -thunderbird-, not from this extension ****/
		appPrefs: Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService).getBranch(''),
		get app_glodaSearchEnabled() { return this.appPrefs.getBoolPref('mailnews.database.global.indexer.enabled') }
	},
	
	/*****************************************************************************************/
	/* Functions to configure elements that depends on initialization or preferences changes */
	configureAutoCompleteTabScrolling: function() {
		if (!this.gsbox) return;
		this.gsbox.tabScrolling = this.options.autoComplete_enableTabScrolling;
	},
	configureAutoCompleteTabScrollingInUnifiedSearchBox: function() {
		if (!this.usbox) return;
		this.usbox.tabScrolling = this.options.autoComplete_enableTabScrolling;
	},
	configureAutoCompleteEnableInSearchBox: function() {
		if (!this.gsbox) return;
		this.gsbox.disableAutoComplete = !this.options.enableAutoCompleteInSearchBox;
	},
	configureAutoCompleteEnableInUnifiedSearchBox: function() {
		if (!this.usbox) return;
		this.usbox.disableAutoComplete = (this.options.unifiedSearchWidgetMode == 'filter');
	},
	
	configureAutoCompleteEnableInFilterBox: function() {
		//TODO:WONTFIX: NEVER WILL BE IMPLEMENTED
	},
	configureHideFilterBox: function() {
		if (!this.qfbox) return;
		if (this.options.hideFilterBox)
			this.qfbox.style.visibility = 'collapse';
		else
			this.qfbox.style.visibility = 'visible';
	},
	configureHideSearchBox: function() {
		if (!this.gsbox) return;
		
		// A global standard option of Thunderbird must be considered: if gloda global and indexed search is disabled in Tools/Options/Advanced,
		// (mailnews.database.global.indexer.enabled) the search box -gsbox- is hidden by TB, but I am re-showing it here!
		// I must do further checks here:
		//  gsbox must be hidden if:
		//   - hideSearchBox == true  (I force to hide the search box, ever do it)
		//	   OR
		//   - mailnews.database.global.indexer.enabled == false   (TB don't want use the GLODA search, but search box can be used to filtering too..)
		// 	   AND
		//   - enableFilteringInSearchBox == false   (..filtering enabled require show the box, including if GLODA search is disabled)
		
		if (this.options.hideSearchBox ||
			(!this.options.app_glodaSearchEnabled &&
			!this.options.enableFilteringInSearchBox))
			this.gsbox.style.visibility = 'collapse';
		else
			this.gsbox.style.visibility = 'visible';
	},
	/* Configurator for a new configuration option that allow hide/show the standard Quick Filter Bar, including the button in the 
		tabs bar that allow show/hide the bar.
		Second attempt: use display css property, 'none' or 'inherit', no incompatible issues found
	*/
	configureHideFilterBar: function() {
		let qfb_button = document.getElementById('qfb-show-filter-bar');
		let qfb = document.getElementById('quick-filter-bar');
		if (!qfb_button || !qfb) return;

		if (this.options.hideFilterBar) {
			qfb_button.style.display = 'none';
			qfb.style.display = 'none';
		} else {
			qfb_button.style.display = '';
			qfb.style.display = '';
		}
	},
	/* Work well, but incompatible with Lightning extension. Use 'configureHideFilterBar' instead.
		First attempt to create 'configureHideFilterBar':
		use the visibility css property and tb-standard functions to hide/show the bar; Incompatible with Lightning extension,
		that do some similar, showing again the bar and the button after Unified Search hide it.
	*/
	configureHideFilterBar_usingVisibility: function() {
		let qfb_button = document.getElementById('qfb-show-filter-bar');
		let qfb = document.getElementById('quick-filter-bar');
		if (!qfb_button || !qfb || !gFolderDisplay) return;

		if (this.options.hideFilterBar) {
			qfb_button.style.visibility = 'collapse';
			qfb.collapsed = true; // a more convenient mode to do a '.style.visibility = collapse'
		} else {
			// This must be handled by the standard function because the normal status can be 'visible' or 'hidden'.
			QuickFilterBarMuxer.onMakeActive(gFolderDisplay);
			// Quick filter bar is showed or not depending on the status of the previous button
			qfb.collapsed = !qfb_button.checked;
		}
	},
	/* Adds shortcuts to the filter options in the standard Quick Filter Box,
		to behavior like the Unified Search Box (that includes shortcuts by default, but standard Thunderbird doesn't) */
	configureShortcutsQFBox: function() {
		document.getElementById('qfb-qs-sender').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-sender-shortcut').value);
		document.getElementById('qfb-qs-recipients').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-recipients-shortcut').value);
		document.getElementById('qfb-qs-subject').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-subject-shortcut').value);
		document.getElementById('qfb-qs-body').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-body-shortcut').value);
		
		document.getElementById('qfb-unread').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-unread-shortcut').value);
		document.getElementById('qfb-starred').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-starred-shortcut').value);
		document.getElementById('qfb-inaddrbook').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-inaddrbook-shortcut').value);
		document.getElementById('qfb-tags').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-tags-shortcut').value);
		document.getElementById('qfb-attachment').setAttribute('accesskey', document.getElementById('unifiedsearch-filter-attachment-shortcut').value);
	},
	replaceQFBoxClearSearch: function() {
		if (!this.qfbox) return;
		this.qfbox.originalClearSearch = this.qfbox._clearSearch;
		this.qfbox.clearSearch = function() {
			// Do the original stuff
			let ret = this.originalClearSearch();
			if (ret)
				// Reset USWidget filter too, to mantain in synchro:
				unifiedsearch.resetUSWFilter();
			return ret;
		}
	},
	/* This function will check if something filter text must be copied from the filter box to the search box,
		to maintain the default TB behavior that preserve the last filter text when TB is closed,
		this is needed when: filtering in search box is enabled AND user is not in the search box.
	 */
	synchronizeFilterTextWithSearchBox: function() {
		if (!this.gsbox || !this.qfbox) return;

		// Only copy when filter is enabled in search box and this has not the focus
		if (this.options.enableFilteringInSearchBox
			//gsbox hasFocus: NO needed with the new listeners/observers
			//&& this.gsbox.inputField != document.commandDispatcher.focusedElement // document.activeElement don't works! (the object reference is not equal never)
			// /* and only if filter box is hidden? */ this.options.hideFilterBox)
			)
		{
			this.gsbox.value = this.qfbox.value;
		}
	},
	synchronizeFilterTextWithUnifiedSearchBox: function() {
		if (!this.usbox || !this.qfbox) return;

		// from synchronizeFilterTextWithSearchBox: preserving last filter text
		//  if usbox has not the focus, jump. Really? NO!
		//if (this.usbox.inputField != document.commandDispatcher.focusedElement)
		this.usbox.value = this.qfbox.value;
	},
	
	configureSynchronizedFilterButtons: function() {
		// observes and command attributes was setted in the xul definition to accomplish this objetive: synchronize filtering buttons,
		// but some extra must be do it here in order that all works fine:
		
		/* The observes property/attribute is setted in the xul file, but for builded TB elements must be setted by code, here: */
		// TODO REVIEW: is need? maybe the source of button problems with TB-31?
		document.getElementById('qfb-unread').observes = 'unifiedsearch-widget-bar-unread';
		document.getElementById('qfb-starred').observes = 'unifiedsearch-widget-bar-starred';
		document.getElementById('qfb-inaddrbook').observes = 'unifiedsearch-widget-bar-inaddrbook';
		document.getElementById('qfb-tags').observes = 'unifiedsearch-widget-bar-tags';
		document.getElementById('qfb-attachment').observes = 'unifiedsearch-widget-bar-attachment';
		document.getElementById('qfb-qs-sender').observes = 'unifiedsearch-widget-bar-qs-sender';
		document.getElementById('qfb-qs-recipients').observes = 'unifiedsearch-widget-bar-qs-recipients';
		document.getElementById('qfb-qs-subject').observes = 'unifiedsearch-widget-bar-qs-subject';
		document.getElementById('qfb-qs-body').observes = 'unifiedsearch-widget-bar-qs-body';
		
		// The sticky is problematic: with only 'observes' the unifiedsearch-widget-sticky don't work, it's something like if the command
		// in the qfb-sticky is not raised/executed, and the state is not preserved (but this same is success in the
		// others buttons !?). Implement a manual execute command here to workaround the bug:
		//document.getElementById("qfb-sticky").observes = "unifiedsearch-widget-sticky";
		let qfbSticky = document.getElementById('qfb-sticky');
		let uswSticky = document.getElementById('unifiedsearch-widget-sticky');
		uswSticky.addEventListener('command', function(aEvent) { qfbSticky.checked = this.checked; qfbSticky.doCommand('');}, true);
		
		// Menu Buttons have a problem: there are no a built-in checked property, add it to our controls:
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-unread');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-starred');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-inaddrbook');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-tags');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-attachment');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-qs-sender');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-qs-recipients');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-qs-subject');
		this.addCheckedPropertyToMenuButton('unifiedsearch-widget-menu-qs-body');
	},
	addCheckedPropertyToMenuButton: function(menuBtnId) {
		let menuBtn = document.getElementById(menuBtnId);
		// What? MenuItem elements have a 'checked' attribute but not a property to get and set it!! grrr...
		//  be patient my friend, let me add it with javascript ;-)
		menuBtn.__defineGetter__('checked', function() { return this.getAttribute('checked'); });
		menuBtn.__defineSetter__('checked', function(val) { this.setAttribute('checked', val); return val; });
	},
	configureUnifiedSearchMenu: function() {
		if (!this.uswidget) return;
		let menuBtn = document.getElementById('unifiedsearch-widget-criteria');
		menuBtn.addEventListener('click', function(aEvent) {
			//document.getElementById('unifiedsearch-widget-menu').openPopup(this, 'after_start', 0, 0, false, false);
			// avoid click event in searchbox that open try to open the options bar and block menu interaction
			aEvent.stopPropagation();
			aEvent.preventDefault();
		}, false);
	},
	configureUnifiedSearchOptionsMode: function() {
		if (!this.uswidget) return;
		let uswc = document.getElementById('unifiedsearch-widget-criteria');
		// *-bar or *-menu
		uswc.setAttribute('popup', 'unifiedsearch-widget-' + this.options.uswOptionsMode);
	},
	configureUnifiedSearchOptionsModeSwitch: function() {
		if (!this.uswidget) return;
		let usebar = document.getElementById('unifiedsearch-widget-menu-usebar');
		let usemenu = document.getElementById('unifiedsearch-widget-bar-usemenu');
		usebar.addEventListener('command', function(aEvent) {
			// 1- close current popup
			let criteria = document.getElementById('unifiedsearch-widget-criteria');
			// open=false don't work, why?
			//criteria.open = false;
			let uswmenu = document.getElementById('unifiedsearch-widget-menu');
			uswmenu.hidePopup();
			// 2- change the mode
			unifiedsearch.options.uswOptionsMode = 'bar';
			// 3- open the new popup
			let uswbar = document.getElementById('unifiedsearch-widget-bar');
			criteria.setAttribute('popup', 'unifiedsearch-widget-bar');
			uswbar.openPopup(criteria, uswbar.getAttribute('position'), 0, 0, false, false);
			// Use the open property fails! need manual 'openPopup'
			//criteria.open = true;
		}, false);
		usemenu.addEventListener('command', function(aEvent) {
			// 1- close current popup
			let criteria = document.getElementById('unifiedsearch-widget-criteria');
			// open=false don't work, why?
			//criteria.open = false;
			let uswbar = document.getElementById('unifiedsearch-widget-bar');
			uswbar.hidePopup();
			// 2- change the mode
			unifiedsearch.options.uswOptionsMode = 'menu';
			// 3- open the new popup
			let uswmenu = document.getElementById('unifiedsearch-widget-menu');
			criteria.setAttribute('popup', 'unifiedsearch-widget-menu');
			uswmenu.openPopup(criteria, uswmenu.getAttribute('position'), 0, 0, false, false);
			// Use the open property fails! need manual 'openPopup'
			//criteria.open = true;
		}, false);
	},
	/* I think the next behavior must be inherit by autocomplete control, but seem don't work. I do here the same that in 'search.xml' component declaration
		(in fact, the code is extracted from there). */
	configureUnifiedSearchEmptyText: function() {
		if (!this.usbox) return;
		this.usbox.setAttribute(
            'emptytext',
            this.usbox.getAttribute('emptytextbase')
                 .replace('#1', this.usbox.getAttribute(
                                  Application.platformIsMac ?
                                  'keyLabelMac' : 'keyLabelNonMac')));
		// Compatibility with TB-5.0+ (the new attribute is 'placeholder' like in HTML5):
		this.usbox.setAttribute('placeholder', this.usbox.getAttribute('emptytext'));
	},
	configureUnifiedSearchTooltipText: function() {
		if (!this.usbox) return;
		let info = document.getElementById('unifiedsearch-widget-info');
		info.setAttribute('label',
            info.getAttribute('label')
                 .replace('#1', info.getAttribute(
                                  Application.platformIsMac ?
                                  'keyLabelMac' : 'keyLabelNonMac')));
	},
	// TODO: don't work well (filter options don't raise the command event; ever give a 'show' state)
	toggleUnifiedSearchClearButton: function () {
		let uswclear = document.getElementById('unifiedsearch-widget-clear');
		if (!this.usbox || !uswclear) return;

		// Show clear button if there is text or filter options activated, hide if not
		if (!/^\s*\s*$/g.test(this.usbox.value) ||
			this.isUnifiedSearchFilterOptionChecked('unread') ||
			this.isUnifiedSearchFilterOptionChecked('starred') ||
			this.isUnifiedSearchFilterOptionChecked('inaddrbook') ||
			this.isUnifiedSearchFilterOptionChecked('tags') ||
			this.isUnifiedSearchFilterOptionChecked('attachment'))
			uswclear.display = '';
		else
			uswclear.display = 'none';
	},
	toggleUnifiedSearchResults: function (forceShow){
		let results = document.getElementById('unifiedsearch-widget-results-tooltip');
		let resultslabel = document.getElementById('unifiedsearch-widget-results-label');
		if (!this.usbox || !results) return;

		if (forceShow !== false && resultslabel.value && !/^\s*\s*$/g.test(resultslabel.value))
			results.openPopup(this.usbox, results.getAttribute('position'), 0, 0, false, false);
		else
			results.hidePopup();
	},
	isUnifiedSearchFilterOptionChecked: function (optionName) {
		return document.getElementById('unifiedsearch-widget-bar-' + optionName).checked;
	},
	configureUnifiedSearchOptions: function () {
		this.configureUnifiedSearchOptionObserveCommand('unread');
		this.configureUnifiedSearchOptionObserveCommand('starred');
		this.configureUnifiedSearchOptionObserveCommand('inaddrbook');
		this.configureUnifiedSearchOptionObserveCommand('tags');
		this.configureUnifiedSearchOptionObserveCommand('attachment');
	},
	configureUnifiedSearchOptionObserveCommand: function (optionName) {
		document.getElementById('unifiedsearch-widget-bar-' + optionName).addEventListener('command', function(aEvent) { unifiedsearch.toggleUnifiedSearchClearButton(); }, true);
	},
	// TODO: override search shortcut (Ctrl+K) if global search is hidded.
	configureGlobalWidgetShortcut: function() {
		if (!this.gsbox || this.gsbox.style.visibility != 'visible') {
			// GSBox is not working, active shortcut for unified search widget
			// ?
		}
		else {
			// normal shortcut handler
			// ?
		}
	},
	/* Shortcut Ctrl/Cmd+Shift+K was setted in XUL file, BUT since
		Thunderbird 8 version, this shortcut is used to focus the
		standard Quick Filter Box (that use Ctrl/Cmd+F shortcut
		in the past), because of this, XUL keyset is overwrited
		and this hack/workaround is needed to focus the 
		Unified Search Widget when this shortcut is pressed
	*/
	configureUnifiedSearchWidgetShortcut: function(aEvent) {
		// Trying to overwrite TB8 shortcut for USWidget:
		window.addEventListener('keydown', function (aEvent) { 
			if (aEvent.ctrlKey && aEvent.shiftKey &&
				aEvent.keyCode == aEvent.DOM_VK_K) {
				// We need know if widget exists yet (maybe was removed from the toolbar!)
				let usb = unifiedsearch.usbox;
				if (usb) {
					usb.focus();
					// usbox is focused! But then Quick Filter box will be focused but we will avoid it now!:
					aEvent.preventDefault();
					aEvent.stopPropagation();
				}
			}
		}, false);
	},
	
	/** Some utils for listeners **/
	_updateUnifiedSearchWidgetMode: function(){

		if (!this.uswidget) return;
		// We check if 
		if (this.uswidget.uswcanfilter) {
			// Reset saved previous mode to allow a smart restoration of user choice about the widget mode
			if (this.uswidget._filterDisabled) {
				if (this.uswidget.uswmode != 'filter')
					this.switchUnifiedSearchAutoComplete();
				// Unlock filtering
				this.uswidget._filterDisabled = false;
			}
		} else {
			// If widget is in filter mode, we need automatically change to search because cannot be
			// used in current context/tab, but remembering it to restore later
			if (this.uswidget.uswmode == 'filter') {
				this.switchUnifiedSearchAutoComplete();
				// Remember that the filter was disabled because
				// cannot be used
				this.uswidget._filterDisabled = true;
			}
		}
	},

	/************************************************************/
	/********** FolderDisplayListener ***************************/
	/** for available events, see: 
		http://mxr.mozilla.org/comm-central/source/mail/base/modules/dbViewWrapper.js#398
		http://mxr.mozilla.org/comm-central/source/mail/base/content/folderDisplay.js#57 
	*/
	folderDisplayListener: {
		/** When Folder Display Widget is starting to load a folder.
			This can be used like the 'selected/active/showed folder has changed' event
			is just what is needed here:
		*/
		onLoadingFolder: function(aFolderDisplay) {
			//unifiedsearch.log('onLoadingFolder: ' + aFolderDisplay.displayedFolder.prettiestName);
			// Local access to the button that enable/disable persist feature (filter must be persisted between folders)
			let sticky = document.getElementById('unifiedsearch-widget-sticky');
			if (!sticky) return;
			// With persistent filter (sticky.checked == true), filter criteria-options and text are preserved and filter
			//  is applied in the new active/showed folder: this is do it auto by TB, nothing to do here.
			// But if is not persistent (sticky.checked == false), we ensure to reset criteria and text in all the
			// widgets:
			if (!sticky.checked)
				// Next clear ensure that QFBar is reset (it have an auto reset, but only if is visible/opened)
				// and then reset the USWidget and global search box -if need it- too.
				unifiedsearch.clearAllFilteringOptions();
		},
		/* when the FolderDisplayWidget is actived: with this event, a change to a non-folder can be listening, 
			something that with onLoadingFolder and anothers can not be do it.
		*/
		onMakeActive: function (aFolderDisplay, aWasInactive) {
			// Check if we are in a non-folder:
			let isNotFolder = !aFolderDisplay.displayedFolder || aFolderDisplay.displayedFolder.isServer;
			// Local acces to the button that enable/disable persist feature (filter must be persisted between folders)
			let sticky = document.getElementById('unifiedsearch-widget-sticky');
			// If we are not in a folder (maybe we are in account central, a root folder)
			// and persist feature is disabled, filter options must be cleared:
			if (isNotFolder && sticky && !sticky.checked) unifiedsearch.clearAllFilteringOptions();
			// Be aware of tabs that not allow 'messages filtering', avoiding errors from the widget:
			unifiedsearch._updateUnifiedSearchWidgetMode();
		}
	},
	/********** ENDS FolderDisplay Listener ************************************/
	
	/**************************************************/
	/********** Tab Monitor ***************************/
	/** for available events, see: 
		http://mxr.mozilla.org/comm-central/source/mail/base/content/tabmail.xml#221
	*/
	tabMonitor: {
		monitorName: 'unifiedsearch',
		onTabTitleChanged: function(aTab) { /* nothing to do, handler required */ },
		onTabSwitched: function(aTab, aOldTab) {
			unifiedsearch._updateUnifiedSearchWidgetMode();
		},
		onTabOpened: function(aTab, aIsFirstTab, aWasCurrentTab) { /* onTabSwitched do the stuff just after onTabOpened, handler required */ },
		onTabClosing: function(aTab) { /* nothing to do, handler required */ },
		onTabPersist: function(aTab) { /* nothing to persist, return null*/ return null; },
		onTabRestored: function(aTab, aState, aIsFirstTab) { /* nothing to restore, handler required */ }
	},
	/**************************************************/
	
	/* Main UI XUL Elements like accesor properties to simplify coding. Check ever if the
		return value is null -this happens when the element is not in the toolbar after use
		'customize' button-.*/
	// Unified search Widget: toolbaritem that contains the usbox, usmenu, usbar and anothers buttons and elements.
	get uswidget() {
		return document.getElementById('unifiedsearch-widget');
	},
	// Unified search widget textBox for input filter/search keywords
	get usbox() {
		return document.getElementById('unifiedsearch-widget-searchbox');
	},
	// The Thunderbird built-in Global Search toolbaritem that contains the global search textbox
	get gswidget() {
		return document.getElementById('gloda-search');
	},
	// The Thunderbird built-in Global Search textBox
	get gsbox() {
		return document.getElementById('searchInput');
	},
	// The Thunderbird built-in Quick Filter Bar that contains filter options and quick filter textbox
	get qfbar() {
		return document.getElementById('quick-filter-bar');
	},
	// The Thunderbird built-in Quick Filter textBox located in the Quick Filter Bar
	get qfbox() {
		return document.getElementById('qfb-qs-textbox');
	},
	// The Thunderbird tabmail element, it manages everything about tabs in the window
	// See: http://mxr.mozilla.org/comm-central/source/mail/base/content/tabmail.xml
	get tabmail() {
		return document.getElementById('tabmail');
	},
	
	/* Initializing Unified Search */
	startup: function (aEvent) {
		this.modTBBuiltIn();
		// Observer changes in preferences
		this.options.appPrefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this.options.appPrefs.addObserver('', unifiedsearch, false);
		// Request listen changes in the Folder Display view and tab changes to know when a different folder is selected, a non-folder
		// or non folder tab (like a search, a calendar tab, etc.) is showed and so on.
		FolderDisplayListenerManager.registerListener(this.folderDisplayListener);
		this.tabmail.registerTabMonitor(this.tabMonitor);
		
		// QFBar with the QFBox:
		if (this.qfbox)
			this.initQFBox(aEvent);
		else
			window.addEventListener('aftercustomization', function(aEvent) {
				if (this.qfbar_isinitied)
					// If already was initied do nothing
					return;
				unifiedsearch.initQFBox(aEvent);
			}, false);
		
		// GSWidget with the GSBox:
		if (this.gsbox)
			this.initGSBox(aEvent);
		else
			window.addEventListener('aftercustomization', function(aEvent) {
				if (this.gsbox_isinitied)
					// If already was initied do nothing
					return;
				unifiedsearch.initGSBox(aEvent);
			}, false);

		// USWidget:
		if (this.uswidget)
			this.initUSWidget(aEvent);
		else
			window.addEventListener('aftercustomization', function(aEvent) {
				if (this.uswidget_isinitied)
					// If already was initied do nothing
					return;
				unifiedsearch.initUSWidget(aEvent);
			}, false);
    this.setupTooltip('unifiedsearch-widget-sticky');
    this.setupTooltip('unifiedsearch-widget-bar-usemenu');
	},
	shutdown: function (aEvent) {
		this.options.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2).removeObserver('', this);
		this.options.appPrefs.QueryInterface(Components.interfaces.nsIPrefBranch2).removeObserver('', this);
	},

  setupTooltip: function (aId) {
    var el = document.getElementById(aId);
    var tooltiptext = el.getAttribute('tooltiptext');
    var accesskey = el.getAttribute('accesskey');
    if (tooltiptext.indexOf(accesskey) === -1) {
      // Accesskey doesn't appear in tooltip, check case insensitive
      var re = RegExp(accesskey, 'i');
      var match = tooltiptext.match(re);
      if (match !== null) {
        // Accesskey appears, but with wrong case
        accesskey = tooltiptext.substr(match.index, match.index);
      } else {
        // Accesskey doesn't appear in tooltip
        tooltiptext += ' (' + accesskey + ')';
      }
    }
    var htmltext = tooltiptext.replace(accesskey, '<u>' + accesskey + '</u>');
    el.setAttribute('tooltipHTML', htmltext);
    el.removeAttribute('tooltiptext');
  },
  onMouseTooltip: function(aEvent) {
    //get the HTML tooltip string assigned to the element that the mouse is over (which will soon launch the tooltip)
    var txt = aEvent.target.getAttribute('tooltipHTML');
    // get the HTML div element that is inside the custom XUL tooltip
    var div = document.getElementById('myHTMLTipDiv');
    //clear the HTML div element of any prior shown custom HTML
    while(div.firstChild)
    	div.removeChild(div.firstChild);
    //safely convert HTML string to a simple DOM object, stripping it of JavaScript and more complex tags
    var injectHTML = Components.classes['@mozilla.org/feed-unescapehtml;1']
      .getService(Components.interfaces.nsIScriptableUnescapeHTML)
      .parseFragment(txt, false, null, div);
    //attach the DOM object to the HTML div element
    div.appendChild(injectHTML);
  },
	
	initQFBox: function (aEvent) {
		if (this.qfbox) {
			this.qfbox_isinitied = true;
			
			this.qfbox.addEventListener('keyup', function (aEvent) {
				unifiedsearch.quickFilterBoxHandler(aEvent, this) 
			}, false);
			this.qfbox.addEventListener('keydown', function (aEvent) {
				unifiedsearch.quickFilterBoxHandler(aEvent, this) 
			}, false);
						
			// Configure all needed:
			this.configureAutoCompleteEnableInFilterBox();
			this.configureHideFilterBox();
			this.configureHideFilterBar();
			this.configureShortcutsQFBox();
			this.replaceQFBoxClearSearch();
		}
	},
	
	initGSBox: function (aEvent) {
		if (this.gsbox) {
			this.gsbox_isinitied = true;
			
			this.gsbox.addEventListener('keyup', function (aEvent) {
				unifiedsearch.globalSearchBoxHandler(aEvent, this);
			}, false);
			this.gsbox.addEventListener('keydown', function (aEvent) {
				unifiedsearch.globalSearchBoxHandler(aEvent, this) 
			}, false);
			
			// Configure all needed:
			this.configureAutoCompleteTabScrolling();
			this.configureAutoCompleteEnableInSearchBox();
			this.configureHideSearchBox();
		}
	},
	
	initUSWidget: function (aEvent) {
		let usbox = this.usbox;
		let uswidget = this.uswidget;
		
		if (usbox && uswidget) {
			this.uswidget_isinitied = true;

			usbox.addEventListener(
			'keydown', function (aEvent) { unifiedsearch.unifiedSearchBoxHandler(aEvent, this) }, true);
			usbox.addEventListener(
			'keyup', function (aEvent) { unifiedsearch.unifiedSearchBoxHandler(aEvent, this) }, true);
			usbox.addEventListener(
			'keypress', function (aEvent) { unifiedsearch.unifiedSearchBoxHandler(aEvent, this) }, false); // false!!!!
			usbox.addEventListener(
			'focus', function (aEvent) { unifiedsearch.unifiedSearchBoxHandler(aEvent, this) }, true);
			usbox.addEventListener(
			'click', function (aEvent) { unifiedsearch.unifiedSearchBoxHandler(aEvent, this) }, true);
			usbox.addEventListener(
			'blur', function (aEvent) { unifiedsearch.unifiedSearchBoxHandler(aEvent, this) }, true);
			
			// uswmode
			uswidget.__defineGetter__('uswmode', function(){ return this.getAttribute('uswmode') });
			uswidget.__defineSetter__('uswmode', function(val){ this.setAttribute('uswmode', val) });
			uswidget.uswmode = this.options.unifiedSearchWidgetMode;
			// uswcanfilter
			uswidget.__defineGetter__('uswcanfilter', function(){
				return ('quickFilter' in unifiedsearch.tabmail.currentTabInfo._ext);
			});
			
			this.configureAutoCompleteTabScrollingInUnifiedSearchBox();
			this.configureAutoCompleteEnableInUnifiedSearchBox();
			this.configureSynchronizedFilterButtons();
			this.configureUnifiedSearchOptionsMode();
			this.configureUnifiedSearchOptionsModeSwitch();
			this.configureUnifiedSearchEmptyText();
			this.configureUnifiedSearchTooltipText();
			this.toggleUnifiedSearchClearButton();
			this.configureUnifiedSearchOptions();
			//this.configureUnifiedSearchMenu(); // Not needed, setup in xul with 'popup' attribute.
			this.configureUnifiedSearchWidgetShortcut();
		}
		//else
		//	this.error('Unified Search Widget will not work: could not be configured, the element don't exists in the document or in the toolbar.');
	},
	
	// Events handlers wrappers for load and unload the extension (to avoid problems with 'this' reference)
	onLoad: function (aEvent) { unifiedsearch.startup(aEvent) },
	onUnLoad: function (aEvent) { unifiedsearch.shutdown(aEvent) },
		
	/* Commands Section */
	cmd_switchUSWidgetMode: function (anEvent) {
		unifiedsearch.switchUnifiedSearchAutoComplete(this.usbox);
	},
	cmd_uswboxFocus: function (anEvent) {
		if (!this.usbox) return;
		this.usbox.focus();
	},
	cmd_clearUnifiedSearchWidget :function (anEvent) {
		unifiedsearch.clearUnifiedSearchWidget(this.usbox);
	},
	cmd_threadFocus: function (anEvent) {
		if (window.SetFocusThreadPane) window.SetFocusThreadPane();
	},
	cmd_foldersFocus: function (anEvent) {
		if (window.SetFocusFolderPane) window.SetFocusFolderPane();
	},
	cmd_messageFocus: function (anEvent) {
		if (window.SetFocusMessagePane) SetFocusMessagePane();
	},
	
	
	/**********************/
	/* mini-utils section */
	/* Callback is a function with a nsITimer like unique parameter;
		delay in miliseconds */
	setCallbackTimeout: function (callback, delay) {
		let timer = Components.classes['@mozilla.org/timer;1']
                    .createInstance(Components.interfaces.nsITimer);
		timer.initWithCallback({notify: callback}, 
			delay, 
			Components.interfaces.nsITimer.TYPE_ONE_SHOT);
	},
	/* Functor is a valid javascript function that will be executed without params;
		delay in miliseconds*/
	setSecureTimeout: function (functor, delay) {
		let timer = Components.classes['@mozilla.org/timer;1']
                    .createInstance(Components.interfaces.nsITimer);
		timer.initWithCallback({notify: function(aTimer){functor()}}, 
			delay, 
			Components.interfaces.nsITimer.TYPE_ONE_SHOT);
	},
	
	/* Debug helpers */
	log: function(text){
		Application.console.log(text);
	},
	error: function(text){
		Components.utils.reportError(text);
	},
	tryGet: function(obj, attr){
		try{return obj[attr];}
		catch(ex){return 'UNACCESIBLE';}
	},
	logObject: function(obj){
		for(var attr in obj)
			this.log(attr + '=' + this.tryGet(obj, attr));
	},
	logObjectAttributes: function(obj){
		for(var iattr = 0; iattr < obj.attributes.length; iattr++)
			this.log(obj.id + ':attribute::' + obj.attributes.item(iattr).nodeName + ': ' + obj.attributes.item(iattr).nodeValue);
	},
	logWidgetBinding: function(widget){
		let st = window.getComputedStyle(widget, null);
		this.log('Binding: ' + widget.MozBinding);
	}
}
window.addEventListener('load', unifiedsearch.onLoad, false);
window.addEventListener('unload', unifiedsearch.onUnLoad, false);
