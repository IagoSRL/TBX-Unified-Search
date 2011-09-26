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
		/*QuickFilterBarMuxer.cmdEscapeFilterStack();
		QuickFilterBarMuxer.cmdEscapeFilterStack();*/
		// Mozilla Thunderbird 3.1 Code: portions from quickFilterBar.js, line 624, function: cmdEscapeFilterStack
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
		unifiedsearch.closeFilter(qfbox);
		unifiedsearch.openGlobalSearch(aSearch);
	},

	// Key shortcut handler
	quickSearchBoxHandler: function(aEvent) {
	
		// 'Control' Modifier
		if (aEvent.ctrlKey) {
			// Press 'Enter'
			if (unifiedsearch.options.searchShorcut_ctrlEnter && 
				aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				unifiedsearch.doGlobalSearch(this);
			}
		}
		// 'Alt' Modifier
		else if (aEvent.altKey) {
			if (unifiedsearch.options.searchShorcut_altEnter && 
				aEvent.keyCode == aEvent.DOM_VK_RETURN) {
				unifiedsearch.doGlobalSearch(this);		
			}
		}
		// Without modifiers: Only pressing 'Enter':
		else if (unifiedsearch.options.searchShorcut_enter && 
				aEvent.keyCode == aEvent.DOM_VK_RETURN) {
			unifiedsearch.doGlobalSearch(this);
		}

		unifiedsearch.previousKeyDown = aEvent.keyCode;
	},
	
	options: {
		prefs: Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.unifiedsearch."),
		get searchShorcut_altEnter() { return this.prefs.getBoolPref("searchShorcut.altEnter") },
		get searchShorcut_ctrlEnter() { return this.prefs.getBoolPref("searchShorcut.ctrlEnter") },
		get searchShorcut_enter() { return this.prefs.getBoolPref("searchShorcut.enter") },
	},
	
	onLoad: function (aEvent) {
		// Attach key handlers
		document.getElementById("qfb-qs-textbox").addEventListener(
        "keydown", unifiedsearch.quickSearchBoxHandler, false);
	}
}
window.addEventListener("load", unifiedsearch.onLoad, false);
