
define(function(require, exports, module) {

    function methodDefToPath(def) {
        var parts = def.split('(')  // [ 'package.outer$innerclass.method', 'params)' ]
                    [0].split('.'); // [ ..., 'method']
        var methodName = parts.pop();
        var className = parts.pop().split('$')[0]; // remove inner class to get filename
        parts.push(className);
        return parts.join('/') + '.java';
    }

    function methodDefToMethodName(def) {
        return def.split('(') // [ 'package.class.method', 'params)' ]
               [0].split('.') // [ ..., 'method']
                  .pop();     // 'method'
    }
    
    function methodDefToClassName(def) {
        var parts = def.split('(') // [ 'package.outer$innerclass.method', 'params)' ]
                    [0].split('.') // [ ..., 'method']
        parts.pop(); // remove 'method'
        return parts.pop().split('$').pop(); // innerclass
    }

    // index into the call graph with a file:line:method,
    // then check the defined_at or referenced_at property for refs and defs respectively
    // there is a problem if there are multiple statements on one line, so we probably need
    // to deal with this in a future version.

    function CallGraph(call_graph) {
        // map the functions by file and line number to their callers
        // transform json input from:
        //  "call_graph": {
        //    "com.example.agentsmith.SignatureDatabaseConnection.matchesRegex(java.lang.String,java.lang.String)": {
        //      "file": "SignatureDatabaseConnection.java",
        //      "line": 243,
        //      "col": 0,
        //      "calls": [{
        //        "method": "android.util.Log.d(java.lang.String,java.lang.String)",
        //        "line": 245,
        //        "col": 8
        //      }, ... ]
        // into:
        // { 
        //       '<filepath>:<line>:<method>' : {
        //                defined_at: {
        //                  path : [ line, ... ]
        //                  ...
        //                },
        //                referenced_at: {
        //                  path: [ line, ... ]
        //                  ...
        //                }
        //       }
        //    ... 
        // }
        // 
        var methods = {};
        
        // change the constructors to class names
        for(var methodDef in call_graph) {
            var methodName = methodDefToMethodName(methodDef);
            
            var _methodDef = methodDef;
            if(methodName == '<init>') {
                methodName = methodDefToClassName(methodDef);
                _methodDef = methodDef.replace('<init>', methodName);
            } 
            
            methods[_methodDef] = call_graph[methodDef];
            methods[_methodDef].methodName = methodName;
        }
        
        // now that the method names are fixed, 
        // 
        for(var methodDef in methods) {
            var method = methods[methodDef];
            if(!method.called_by) method.called_by = [];

            var path = methodDefToPath(methodDef);
            var methodName = method.methodName;
            var line = method.line || null;
            
            var methodDefKey = path + ':' +  line + ':' + methodName;
            
            var def = {}; def[path] = [ line ]; //TODO this number needs to be corrected by looking it up in a file

            if(line != null && !this[methodDefKey])
                this[methodDefKey] = { referenced_at: {} };

            for(var i = 0; i < method.calls.length; i++) {
                var callee = method.calls[i];
                
                // need to correct the callee method name if it has <init>
                var calleeMethodName = methodDefToMethodName(callee.method);
                if(calleeMethodName == '<init>') {
                  calleeMethodName = methodDefToClassName(callee.method);
                  callee.method = callee.method.replace('<init>', calleeMethodName);
                }

                if(!methods[callee.method]) methods[callee.method] = { methodName: calleeMethodName, called_by: [] };

                // add the called_by array if not already there
                if(methods[callee.method]) {
                  if(!methods[callee.method].called_by) methods[callee.method].called_by = [];

                  // add the called_by relationships
                  methods[callee.method].called_by.push({ line: callee.line, method: methodDef });
                }
            }
        }
        
        // orient by file:line:methodname for efficient lookup on click
        // add defined_at
        for(var methodDef in methods) {
            var path = methodDefToPath(methodDef);
            var method = methods[methodDef];
            var methodName = method.methodName;
            
            var line = method.line;
            
            var methodDefKey = path + ':' +  line + ':' + methodName;
            
            var def = {}; def[path] = [ line ]; //TODO this number needs to be corrected by looking it up in a file
            
            // add referenced_at
            for(var i = 0; i < method.called_by.length; i++) {
                var ref = method.called_by[i];
                var refLine = ref.line;
                var refFile = methodDefToPath(ref.method);
                
                // when someone clicks on a callsite, this is the key that will get looked up
                // which points to the definition
                // TODO list subclass methods
                var methodRefKey = refFile + ':' + refLine + ':' + methodName; // : { defined_at: [ ... ]}
                
                var ref = {}; ref[refFile] = [ refLine ];
                
                // add def to ref
                if(!this[methodRefKey]) 
                    this[methodRefKey] = { defined_at: def };

                // add ref to def 
                if(this[methodDefKey]) {   
                    var defRefs = this[methodDefKey].referenced_at[refFile];
                    if(!defRefs) this[methodDefKey].referenced_at[refFile] = [];
                    this[methodDefKey].referenced_at[refFile].push(refLine);
                }
            }  
        }
    }


    exports.CallGraph = CallGraph;
})
