/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import java.util.Calendar;
import java.util.Date;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if(intent.getAction().equals("android.intent.action.BOOT_COMPLETED"))
        {
    	        Intent newIntent = new Intent(context, ScanService.class);
        		context.startService(newIntent);			
        	
        }
    }

}
