/**
 * Searchinfiles Module for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

/*global tabEditors searchRow winSearchInFiles winSearchReplace  rbSFSelection
    txtSFFind chkSFRegEx tooltipSearchInFiles txtSFReplace txtSFPatterns
    trFiles chkSFMatchCase chkSFRegEx chkSFConsole tabConsole btnSFFind,
    chkSFWholeWords, grpSFScope */

define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var util = require("core/util");
var settings = require("core/settings");
var editors = require("ext/editors/editors");
var fs = require("ext/filesystem/filesystem");
var menus = require("ext/menus/menus");
var commands = require("ext/commands/commands");
var tooltip = require("ext/tooltip/tooltip");
var CallGraph = require("./model").CallGraph;
var myutils = require("../androidanalysis/myutils")


// Ace dependencies
var EditSession = require("ace/edit_session").EditSession;
var Document = require("ace/document").Document;
var Range = require("ace/range").Range;

module.exports = ext.register("ext/callgraph/callgraph", {
    name     : "Analysis Results",
    dev      : "Ucombinator.org",
    type     : ext.GENERAL,
    alone    : true,
    offline  : false,
    autodisable  : ext.ONLINE | ext.LOCAL,
    pageTitle: "Log",
    pageID   : "pgCallGraph",
    resultsConsolePath: ide.davPrefix + "/analysis.results",
    nodes    : [],

    // lazily load the call graphs for apps when files are clicked

    searchContentType : "c9search",

    hook : function(){
        var _self = this;
        ext.initExtension(_self);
    },

    init : function(amlNode){
        var _self = this;
        this.callGraphs = {};

        // race condition when there is another risk report open?
        //ide.addEventListener("aftereditorfocus", function(e) {
        //    if (_self.callGraphConsole && _self.returnFocus)
        //        _self.callGraphConsole.focus(); 
        //});
        
        require('ext/codetools/codetools').register(this/*the parameter should be an observer, but is ignored*/);
        
        ide.addEventListener("codetools.codedblclick", function (e) {
            setTimeout(function () {
                // get the selected word in order to lookup the method def/ref
                // by line number in the file
                var editor = editors.currentEditor.amlEditor.$editor;
                var selection = editor.getSelection();
                var range = selection.getWordRange();
                var selectedText = selection.doc.getTextRange(range);
                var line = range.start.row + 1;
                var path = editor.session.c9doc.getNode().getAttribute("path");
                selection.clearSelection();
                
                _self.onClickCodeEditor(path, line, selectedText);            
            },80) // otherwise the selection is affected by a slow mouse release
        });
        
        tabConsole.addEventListener("afterswitch", function(e){
            if (e.currentTarget.activepage == _self.pageID) {
                //apf.layout.forceResize(_self.callGraphConsole.$ext);
            }
        });
        
        commands.addCommand({
            name: "bookmarkLine",
            hint: "bookmark a line to return to it later",
            msg: "It will appear in the Log",
            bindKey: {mac: "Command-Shift-B", win: "Ctrl-Shift-B"},
            isAvailable : function() {
                return true;    
            },
            exec: function() {
                var editor  = editors.currentEditor.amlEditor.$editor;
                var selection   = editor.getSelection();
                var range       = selection.getLineRange();
                var path    = editor.session.c9doc.getNode().getAttribute("path");
                var row     = range.start.row; 
                var rowText = selection.doc.getTextRange(range).replace('\n', ''); 

                _self.displayMessage(["Bookmark", path.replace(ide.davPrefix, '')+':', '    ' + (row+1) + ': ' + rowText]); 
            }
        })
    },
    onClickCodeEditor : function (path, line, identifier) {
        var _self = this;
        
        // TODO extract appName from path
        var appName = path.split('/')[2];
        
        // by convention, the callgraph resides in 
        // the AppName/reports/appname_callgraph.json (note the lowercase in filename)
        var callGraphPath = ide.davPrefix + 
            '/' + appName + '/reports/'+appName.toLowerCase()+'_callgraph.json';
        
        var useCallGraph = function () { 
            var basePath = ide.davPrefix + '/'+appName+'/project/src/';
            var srcPath = path.replace(basePath, '');
            
            // TODO the line will be off (since it is the first stmt line, not method def line
            //      so need to increment line until it is found
            //      allow for line error of up to ten which means that the first stmt can have 
            //      be ten lines below the method def.  This is uncommon, but could be a problem.
            var MAX_LINE_ERROR = 10;
            var method;
            var originalLine = line; 
            while(!(method = _self.callGraphs[appName][srcPath+':'+line+':'+identifier])) { 
                ++line; 
                if(line > (originalLine + MAX_LINE_ERROR)) {
                     console.error('could not find method def ' + srcPath+':'+originalLine + '-' + line+':'+identifier);
                     _self.displayMessage('The method ' + identifier + ' in ' + srcPath + ' is not in the call graph at this source line.');
                     _self.setHighlight(_self.callGraphConsole.$editor.getSession(), identifier);
                     break;
                }
            }
            if(!method) return;
            
            if(method.referenced_at) {
               _self.printCallers(appName, identifier, method.referenced_at);
            } else if(method.defined_at) {
               for(var defPath in method.defined_at) {
                  var row = method.defined_at[defPath][0];
                  if(row == null) {
                    _self.jumpToDefinition(basePath + defPath, null, identifier); 
                  } else {
                    _self.jumpToDefinition(basePath + defPath, row-1, identifier); 
                  }
                  break; // currently only 1 definition (not adding subclass methods to graph (?) 
               }
               
            }
        }
        
        // load the call graph lazily:
        // if the callgraph is not already loaded, do a get request, parse it and
        if(appName in this.callGraphs) {
          useCallGraph();
        } else {
            var http = new apf.http();
            http.getJSON(apf.host + callGraphPath, function(json, state, extra){
                if (state != apf.SUCCESS)
                    console.warn("no call graph at path: " + apf.host + callGraphPath);
                _self.callGraphs[appName] = new CallGraph(json.call_graph);
                useCallGraph();      
            })
        }
    },
    // when a method is clicked, open the source of the method def
    jumpToDefinition: function (path, row, identifier) {
        var _self = this;
        var prevEditor  = editors.currentEditor.amlEditor.$editor;
        var selection   = prevEditor.getSelection();
        var range       = selection.getLineRange();
        var prevPath    = prevEditor.session.c9doc.getNode().getAttribute("path");
        var prevRow     = range.start.row; 
        var prevRowText = selection.doc.getTextRange(range).replace('\n', ''); 

        fs.exists(path, function(exists) {
            if(!exists) {
                _self.displayMessage("No source info available for " + identifier + " at path " + path.replace(ide.davPrefix, ''));
            } else {
                selection.clearSelection(); 
                myutils.jumpToFile({
                    path: path,
                    row: row != null ? row : 0,
                    column: 0,
                    text: identifier
                }, function (e) {
                    // TODO the line is off due to method def line being first instruction line
                    //      need to correct when loading call graph to avoid this...
                    var newEditor    = editors.currentEditor.amlEditor.$editor;
                    var newPath      = newEditor.session.c9doc.getNode().getAttribute("path");
                    var newSelection = newEditor.getSelection();
                    
                    if(row == null) {
                       newSelection.selectFileStart();
                    } else {
                       //TODO find the text
                       
                       newSelection.setSelectionRange(new Range(row, 0, row, newSelection.doc.getLine(row).length-1));
                    }
                    
                    var newRange     = newSelection.getLineRange();
                    var newRow       = newRange.start.row; 
                    var newRowText = newSelection.doc.getTextRange(newRange).replace('\n', '');

                    _self.displayMessage([
                        'jumped from ' + identifier + ' reference at',
                        prevPath.replace(ide.davPrefix, '') + ':',
                        '    ' + (prevRow+1) + ': ' + prevRowText,
                        'to definition ' + (row == null ? ' in file (exact source info line unavailable)' : ' at'),
                        path.replace(ide.davPrefix, '') + ':',
                        '    ' + (newRow+1) + ': ' + newRowText
                    ]);
                    _self.setHighlight(_self.callGraphConsole.$editor.getSession(), identifier);
                });
            }
        })
    },
    displayMessage: function (msg) {
        var _self = this;
        
        if(msg) {
            _self.initResultsPanel();

            var doc = this.consoleacedoc;
            var editor = this.callGraphConsole.$editor;
            
            var currLength = doc.getLength() - 2; // the distance to the last message
                editor.scrollToLine(currLength, false, true);
            _self.appendLines(doc, '\n\n');
            _self.appendLines(doc, msg);
        }
    },
    initResultsPanel: function () {
        var _self = this;
        // prepare new Ace document to handle call graph results
        var node = apf.n("<file/>")
            .attr("name", "Search Results")
            .attr("path", this.resultsConsolePath)
            .attr("customtype", util.getContentType(this.searchContentType))
            .attr("tooltip", "Search Results")
            .attr("newfile", "0")
            .attr("ignore", "1")
            .attr("saving", "1")
            .node();

        var doc = ide.createDocument(node);

        // show the console; require here is necessary for c9local, please do not change
        require("ext/console/console").show();

        this.makeCallGraphPanel();

        // the search results already exist
        if (!_self.consoleacedoc) {
            _self.callGraphConsole.$editor.setSession(new EditSession(new Document(''), "ace/mode/c9search"));
            _self.consoleacedoc = _self.callGraphConsole.$editor.session.doc; // store a reference to the doc

            _self.consoleacedoc.ace = _self.callGraphConsole.$editor;

            // set tab editor commands here
            _self.callGraphConsole.$editor.commands._defaultHandlers = commands._defaultHandlers;
            _self.callGraphConsole.$editor.commands.commands = commands.commands;
            _self.callGraphConsole.$editor.commands.commmandKeyBinding = commands.commmandKeyBinding;
            _self.callGraphConsole.$editor.getSession().setUndoManager(new apf.actiontracker());
        }
    },
    printCallers: function(appName, method, callers) {
        var _self = this;

        var lines = []
        var file_cnt = 0;
        var ref_cnt = 0;
        for(var pkgPath in callers) {
            lines.push('/' + appName + '/project/src/' + pkgPath + ':')
            for(var i = 0; i < callers[pkgPath].length; i++) {
              lines.push('    ' + callers[pkgPath][i] + ': ' + method);
              ++ref_cnt;
            }
            ++file_cnt;
        }
        lines.unshift(_self.messageHeader(method, file_cnt, ref_cnt));
        
        _self.displayMessage(lines.join('\n'));
        _self.setHighlight(_self.callGraphConsole.$editor.getSession(), method);
        
        return true;

    },
    launchFileFromCallerList : function(editor) {
        var session = editor.getSession();
        var currRow = editor.getCursorPosition().row;

        var clickedLine = session.getLine(currRow).split(": "); // number:text
        if (clickedLine.length < 2) // some other part of the editor
            return;

        // "string" type is the parent filename
        while (currRow --> 0) {
            var token = session.getTokenAt(currRow, 0);
            if (token && token.type.indexOf("string") != -1)
                break;
        }

        var path = editor.getSession().getLine(currRow);

        if (path.charAt(path.length - 1) == ":")
            path = path.substring(0, path.length-1);

        // prevent double '//' in paths
        if(path[0] === '/')
            path = path.substring(1);

        if (!path)
            return;
        var row = parseInt(clickedLine[0], 10);
        var range = editor.getSelectionRange();
        var offset = clickedLine[0].length + 2;
        myutils.jumpToFile({
            path: ide.davPrefix + '/' + path,
            row: row,
            column: 0,
            text: clickedLine[1]
        }, function (e) {
            
        });
    },

    appendLines : function(doc, content) {
        if (!content || (!content.length && !content.count)) // blank lines can get through
            return;

        if (typeof content != "string")
            content = content.join("\n");

        if (content.length > 0) {
            doc.ace.$blockScrolling++;
            doc.insert({row: doc.getLength(), column: 0}, content);
            doc.ace.$blockScrolling--;
        }
    },

    messageHeader: function(query, file_cnt, ref_cnt) {
        var message = "Found " + ref_cnt;

        message += (ref_cnt > 1 || ref_cnt == 0) ? " references" : " reference";
        message += " to " + query + " in " + file_cnt;
        message += (file_cnt > 1 || file_cnt == 0) ? " files" : " file";
        if(ref_cnt > 0) message+= ':';
        return message;
    },

    makeCallGraphPanel : function() {
        var _self = this;
        // create editor if it does not exist
        if (this.$panel == null) {
            this.$panel = tabConsole.add(this.pageTitle, this.pageID);
            this.$panel.setAttribute("closebtn", true);

            tabConsole.set(this.pageID);

            this.callGraphConsole = this.$panel.appendChild(new apf.codeeditor({
                syntax            : "c9search",
                "class"           : "nocorner aceSearchConsole aceSearchResults",
                theme             : "ace/theme/monokai",
                overwrite         : "[{require('core/settings').model}::editors/code/@overwrite]",
                folding           : "true",
                style             : "position:absolute;left:0;right:0;top:0;bottom:0",
                behaviors         : "[{require('core/settings').model}::editors/code/@behaviors]",
                selectstyle       : "false",
                activeline        : "[{require('core/settings').model}::editors/code/@activeline]",
                gutterline        : "[{require('core/settings').model}::editors/code/@gutterline]",
                showinvisibles    : "false",
                showprintmargin   : "false",
                softtabs          : "[{require('core/settings').model}::editors/code/@softtabs]",
                tabsize           : "[{require('core/settings').model}::editors/code/@tabsize]",
                scrollspeed       : "[{require('core/settings').model}::editors/code/@scrollspeed]",
                newlinemode       : "[{require('core/settings').model}::editors/code/@newlinemode]",
                animatedscroll    : "[{require('core/settings').model}::editors/code/@animatedscroll]",
                fontsize          : "[{require('core/settings').model}::editors/code/@fontsize]",
                gutter            : "[{require('core/settings').model}::editors/code/@gutter]",
                highlightselectedword : "[{require('core/settings').model}::editors/code/@highlightselectedword]",
                autohidehorscrollbar  : "[{require('core/settings').model}::editors/code/@autohidehorscrollbar]",
                fadefoldwidgets   : "false",
                wrapmodeViewport  : "true"
            }));
            
            _self.callGraphConsole.$editor.session.setWrapLimitRange(null, null);

            this.$panel.addEventListener("afterclose", function() {
                this.removeNode();
                _self.$panel = null;
                _self.consoleacedoc = null;
                return false;
            });

            _self.callGraphConsole.addEventListener("keydown", function(e) {
                if (e.keyCode == 13) { // ENTER
                    if (e.altKey === false) {
                        _self.launchFileFromCallerList(_self.callGraphConsole.$editor);
                        _self.returnFocus = false;
                    }
                    else {
                        _self.callGraphConsole.$editor.insert("\n");
                    }
                    return false;
                }
            });

            _self.callGraphConsole.addEventListener("keyup", function(e) {
                if (e.keyCode >= 37 && e.keyCode <= 40) { // KEYUP or KEYDOWN
                    if (apf.isTrue(settings.model.queryValue("editors/code/filesearch/@consolelaunch"))) {
                        _self.launchFileFromCallerList(_self.callGraphConsole.$editor);
                        //_self.returnFocus = true;
                        return false;
                    }
                }
            });
               
            _self.callGraphConsole.$editor.renderer.scroller.addEventListener("dblclick", function() {
                _self.launchFileFromCallerList(_self.callGraphConsole.$editor);
            });
            
        }
        else {
            if (apf.isTrue(settings.model.queryValue("auto/console/@clearonrun")))
                this.consoleacedoc.removeLines(0, this.consoleacedoc.getLength());

            tabConsole.appendChild(this.$panel);
            tabConsole.set(this.pageID);
        }
    },

    setHighlight : function(session, query) {
        session.highlight(query);
        session.c9SearchHighlight = session.$searchHighlight;
        session.$searchHighlight = null;
    },

    destroy : function(){
        //menus.remove("Find/~", 10000);
        //menus.remove("Find in Files...");

        //commands.removeCommandByName("searchinfiles");
        this.$destroy();
    }
});

});
