/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import java.util.List;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.Toast;

import com.example.agentsmith.SignatureDatabaseConnection.SignatureSource;

public class PhoneScanReceiver extends BroadcastReceiver {

	private SignatureDatabaseConnection sdc;

	@Override
	public void onReceive(Context context, Intent intent) {


				
		Log.i("PSR", "In phone receiver");
		sdc = new SignatureDatabaseConnection(context);

		if (intent.getAction().equals(Intent.ACTION_NEW_OUTGOING_CALL)) {
		         String number = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER);

		         Log.d("PSR","Number: "+number);
		         
		         List<MaliciousSignature> sigs = sdc.getSignatures(number, SignatureSource.Phone, "Dial out");
		         
		         if(sigs.isEmpty()){
		        	 Toast.makeText(context, "Number is Clean!", Toast.LENGTH_SHORT).show();
		         }
		         else{
		        	 Toast.makeText(context, "Number is Evil! Malicious Sigs detected: " + sigs.size(), Toast.LENGTH_SHORT).show();
		        	 for(MaliciousSignature sig : sigs){
		        		 sdc.addHistory(sig.timestamp, sig.ss + " " + sig.type,"Signature: "+sig.sig,  sig.appName, sig.trigger, sig.level );
		        	 }
		         }
		        
		}
		 sdc.close();
	}

}
