var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var conditionsList = [];
var counter = 0;
function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases()

}

var engine = Random.engines.mt19937().autoSeed();
var phoneOptions = [
	{
    'normalize': true
	}, 
	{
    'shouldNormalize': true
	}
];

function createConcreteIntegerValue( greaterThan, constraintValue )
{
	if( greaterThan )
		return Random.integer(constraintValue,constraintValue+10)(engine);
	else
		return Random.integer(constraintValue-10,constraintValue)(engine);
}

function Constraint(properties)
{
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	// Supported kinds: "fileWithContent","fileExists"
	// integer, string, phoneNumber
	this.kind = properties.kind;
}

function fakeDemo()
{
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{		
		'path/filePresent': {"ravneet.txt":"DevOps"},
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
  			file1_new: '',
		}
	}
};


function generateTestCases()
{

	var content = "var subject = require('./subject.js')\nvar mock = require('mock-fs');\n";
	for ( var funcName in functionConstraints )
	{
		var params = {};

		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			//params[paramName] = '\'' + faker.phone.phoneNumber()+'\'';
			params[paramName] = [];
		}

		//console.log( params );

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		var phone = _.contains(functionConstraints[funcName].params, "phoneNumber");
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {kind: 'fileWithContent' });
		var pathExists      = _.some(constraints, {kind: 'fileExists' });

		// plug-in values for parameters


		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				//params[constraint.ident] = constraint.value;
				params[constraint.ident].push(constraint.value);
			}	
		}
       
        conditionsList = [];

        for (parameter in params){

   	    	var subelement = [];
   	    	for (var i =0; i< params[parameter].length; i++ )
   	    	{
   	    		subelement.push(params[parameter][i]);
   	    	}
   	        conditionsList.push(subelement);
		}

		for(parameter in params)
		{
		  	counter++;
		}
  		

	  	var posibleTestCases = [];
	  	for ( var i=0; i < conditionsList[0].length; i++)
	  	{
	  		var list1 = [];
	  		var list2 = getPossibleTestCombination(conditionsList[0][i],list1.slice(), 1,conditionsList[1]);
	  		for (var j =0; j< list2.length; j++){
            posibleTestCases.push(list2[j]);
            //console.log("pushing in output "+list2[j]);
	  		}
	  	}

		// Prepare function arguments.
		for (ptc in posibleTestCases){
			var args = Object.keys(posibleTestCases[ptc]).map( function(k) {
			return posibleTestCases[ptc][k]; }).join(",");
			if( pathExists || fileWithContent )
			{
				content += generateMockFsTestCases(pathExists,fileWithContent,funcName, args);
				//
				content += generateMockFsTestCases(pathExists,!fileWithContent,funcName, args);
				//
				content += generateMockFsTestCases(!pathExists,fileWithContent,funcName, args);
				//
				content += generateMockFsTestCases(!pathExists,!fileWithContent,funcName, args);

				// Bonus...generate constraint variations test cases....
			}
			else
			{
				// Emit simple test case.
				content += "subject.{0}({1});\n".format(funcName, args );
			}
		}
		if (phone) {

            for (var i = 0; i < phoneOptions.length; i++) {
                args = '';
                var option = [];
                option = phoneOptions[i];
                
                
                args += "'" + faker.phone.phoneNumber() + "','" + faker.phone.phoneFormats() + "'," + JSON.stringify(option);
                content += "subject.{0}({1});\n".format(funcName, args);
            }

        }
	}
	fs.writeFileSync('test.js', content, "utf8");
}

function getPossibleTestCombination(currentElement,newArray,listNumber,nextArray)
{
	var possibleTests =[];
	newArray.push(currentElement);
	var nextList = listNumber+1;
	if(nextArray == null)
	{
		possibleTests.push(newArray);
		return possibleTests;
	}

	for(var i =0; i<nextArray.length; i++)
	{
		var copyarray = getPossibleTestCombination(nextArray[i],newArray.slice(),nextList,conditionsList[nextList] )
		for(var j=0; j<copyarray.length; j++)
		{
	         possibleTests.push(copyarray[j]);
		}
	}
	return possibleTests;
}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
    var buf = fs.readFileSync(filePath, "utf8");
    var result = esprima.parse(buf, options);

	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: rightHand,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}),
							new Constraint(
							{
								ident: child.left.name,
								value: '"DevOps"',
								funcName: funcName,
								kind: "string",
								operator : child.operator,
								expression: expression
							})
						);
					}

				if( child.left.type == 'Identifier' && child.left.name == "area")
				{
						// get expression from original source code:
					var expression = buf.substring(child.range[0], child.range[1]);
					var rightHand = buf.substring(child.right.range[0], child.right.range[1])
					var val = '"' + "(" + String(child.right.value) + ")" + " " + "123-4567" + '"';
					functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: params[0],
							value: val,
							funcName: funcName,
							kind: "integer",
							operator : child.operator,
							expression: expression
						}));
					}				
				}
				
				if( child.type === 'BinaryExpression' && child.operator == ">")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
						{
								// get expression from original source code:
							var expression = buf.substring(child.range[0], child.range[1]);
							var rightHand = buf.substring(child.right.range[0], child.right.range[1])
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: parseInt(rightHand)-2,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}),
                            new Constraint(
							{
								ident: child.left.name,
								value: parseInt(rightHand)+2,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							})
						);
					}
				}

				if( child.type == "CallExpression" && child.callee.property && child.callee.property.name =="replace" )
				{
					var phoneNum = "'" + String(faker.phone.phoneNumberFormat())+ "'";
					for( var i =0; i < params.length; i++ )
					{								
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: params[i],
							value:  phoneNum,
							funcName: funcName,
							kind: "phoneNumber",
							operator : child.operator,
							expression: expression
						}));								
					}
				}

				if( child.type === 'BinaryExpression' && child.operator == "<")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: parseInt(rightHand)-2,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}),
		                    new Constraint(
							{
								ident: child.left.name,
								value: parseInt(rightHand)+2,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							})
						);
					}
				}

				if( child.type == "CallExpression" && child.callee.property && child.callee.property.name =="substring" )
				{
					var newphoneno = "'" + String(faker.phone.phoneNumberFormat())+ "'";
					for( var p =0; p < params.length; p++ )
					{						
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: params[p],
							value: newphoneno,
							funcName: funcName,
							kind: "string",
							operator : child.operator,
							expression: expression
						}));						
					}
				}

				if( child.type == "CallExpression" &&  child.callee.property && child.callee.property.name =="indexOf" )
				{
					var indexOfVar = "'" + String(child.arguments[0].value)+ "'";
					for( var p =0; p < params.length; p++ )
					{								
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.callee.object.name,
							value:  indexOfVar,
							funcName: funcName,
							kind: "string",
							operator : child.operator,
							expression: expression
						}));				
					}
				}
						

				if( child.type == "CallExpression" && child.callee.property && child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file1'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}),
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file1_new'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}

				if( child.type == "CallExpression" &&  child.callee.property && child.callee.property.name =="readdirSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[0],
								value:  "'path/filePresent'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}),
							new Constraint(
							{
								ident: params[0],
								value:  "'path/fileExists'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}

				if( child.type == "CallExpression" && child.callee.property && child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
							{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[0],
										// A fake path to a file
								value:  "'path/fileExists'",
								funcName: funcName,
								kind: "fileExists",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}
			});
			//console.log( functionConstraints[funcName]);
		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;
    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	}
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();