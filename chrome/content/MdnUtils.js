/**
    Some utils from MDN tutorials, snippets,
    adapted for a module.
**/
var EXPORTED_SYMBOLS = ["MdnUtils"];

function MdnUtils(window, document) {

    /**
     * Installs the toolbar button with the given ID into the given
     * toolbar, if it is not already present in the document.
     *
     * @param {string} toolbarId The ID of the toolbar to install to.
     * @param {string} id The ID of the button to install.
     * @param {string} afterId The ID of the element to insert after. @optional
     *
     * Source: https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Toolbar#Adding_button_by_default
     */
    function installButton(toolbarId, id, afterId) {

        if (!document.getElementById(id)) {
            var toolbar = document.getElementById(toolbarId);

            // If no afterId is given, then append the item to the toolbar
            var before = null;
            if (afterId) {
                let elem = document.getElementById(afterId);
                if (elem && elem.parentNode == toolbar)
                    before = elem.nextElementSibling;
            }

            toolbar.insertItem(id, before);
            toolbar.setAttribute("currentset", toolbar.currentSet);
            document.persist(toolbar.id, "currentset");

            if (toolbarId == "addon-bar")
                toolbar.collapsed = false;
        }
    }
    
    /**
        API
    **/
    return {
        installButton: installButton
    };
}
