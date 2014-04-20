
define(function(require, exports, module) {

    function methodDefToPath(def) {
        var parts = def.split('(')  // [ 'package.class.method', 'params)' ]
                    [0].split('.'); // [ ..., 'method']
        var methodName = parts.pop();
        var className = parts.pop().split('$')[0];
        parts.push(className);
        return parts.join('/') + '.java';
    }

    function methodDefToMethodName(def) {
        return def.split('(') // [ 'package.class', 'params)' ]
               [0].split('.') // [ ..., 'method']
                  .pop();     // 'method'
    }

    // index into the call graph with a file:line:method,
    // then check the defined_at or referenced_at property for refs and defs respectively
    // there is a problem if there are multiple statements on one line, so we probably need
    // to deal with this in a future version.

    function CallGraph(methods) {
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
        
        // first add called_by relationships
        for(var methodDef in methods) {
            var method = methods[methodDef];
            if(!method.called_by) method.called_by = [];

            var path = methodDefToPath(methodDef);
            var methodName = methodDefToMethodName(methodDef);
            var method = methods[methodDef];
            var line = method.line || null;
            
            var methodDefKey = path + ':' +  line + ':' + methodName;
            
            var def = {}; def[path] = [ line ]; //TODO this number needs to be corrected by looking it up in a file

            if(line != null && !this[methodDefKey])
                this[methodDefKey] = { referenced_at: {} };

            for(var i = 0; i < method.calls.length; i++) {
                var callee = method.calls[i];

                if(!methods[callee.method]) methods[callee.method] = { called_by: [] };

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
            var methodName = methodDefToMethodName(methodDef);
            var method = methods[methodDef];
            var line = method.line;
            
            var methodDefKey = path + ':' +  line + ':' + methodName;
            
            var def = {}; def[path] = [ line ]; //TODO this number needs to be corrected by looking it up in a file
            
            // add referenced_at
            for(var i = 0; i < method.called_by.length; i++) {
                var ref = method.called_by[i];
                var refLine = ref.line;
                var refFile = methodDefToPath(ref.method);
                var methodRefKey = refFile + ':' + refLine + ':' + methodName;
                
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
