/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import java.util.Calendar;

import com.example.agentsmith.SignatureDatabaseConnection.SignatureSource;

public class MaliciousSignature {

	SignatureSource ss;
	String type;

	String sig;
	String trigger;
	
	String timestamp;
	
	String appName = "";
	
	String description = "";
	
	enum LevelEnum{
		Severe, Moderate, Warn;
	}
	
	LevelEnum level;
	
	public MaliciousSignature(SignatureSource source, String type2,
			String sigString, String ts, LevelEnum le,String name, String desc) {
		ss = source;
		type = type2;
		sig = sigString;
		timestamp = ts;
		trigger = name;
		level = le;
		description = desc;
	}


}
