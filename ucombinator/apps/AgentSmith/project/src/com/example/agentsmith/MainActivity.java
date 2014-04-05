/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.database.sqlite.SQLiteCursor;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.AdapterView;
import android.widget.AdapterView.OnItemClickListener;
import android.widget.Button;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.SimpleCursorAdapter;

public class MainActivity extends Activity implements OnClickListener,OnItemClickListener{

	/**
	 * The serialization (saved instance state) Bundle key representing the
	 * current tab position.
	 */
	private static final String STATE_SELECTED_NAVIGATION_ITEM = "selected_navigation_item";
	private static final int SHOW_HIST_DIALOG = 1;
	SignatureDatabaseConnection sdc;
	private SimpleCursorAdapter adapter;
	private ListView histView;
	private BroadcastReceiver progressReceiver;
	private int REMOVE_APP_DIALOG = 0;
	private BroadcastReceiver removeReceiver;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);

		sdc = new SignatureDatabaseConnection(this);
		
		 histView = (ListView) findViewById( R.id.historyListView );  
		
		Cursor curse = sdc.getHistoryCursor();
		
		  String[] columns = new String[] {
				  SignatureDatabaseConnection.FILENAME,
				  SignatureDatabaseConnection.TIME,
				  SignatureDatabaseConnection.TYPE,				  
				 // SignatureDatabaseConnection.LEVEL,

		  };

		  int[] to = new int[] { 
		    R.id.historyRow,
		    R.id.hist_time, 
		    R.id.hist_type
		  };

		  
		  adapter = new SimpleCursorAdapter(
				    this, R.layout.row, 
				    curse, 
				    columns, 
				    to,
				    0);
  
		  histView.setAdapter(adapter);
		  histView.setOnItemClickListener(this);
		  
		  Button scanButton = (Button) findViewById( R.id.scanButton );  
		  scanButton.setOnClickListener(this);
		  
		  ProgressBar prog = (ProgressBar) findViewById( R.id.scanProgress );  
		  prog.setVisibility(ProgressBar.INVISIBLE);
			
		  
		  progressReceiver = new BroadcastReceiver(){

			@Override
			public void onReceive(Context c, Intent i) {
				 Log.d("SS", "Got Progress update");
				 ProgressBar prog = (ProgressBar) findViewById( R.id.scanProgress );  
				 if(!prog.isShown()){
					 prog.setVisibility(ProgressBar.VISIBLE);
				 }
				 if(i.hasExtra(ScanService.EXTRA_SCAN_PROGRESS)){
					
					 double progval = i.getDoubleExtra(ScanService.EXTRA_SCAN_PROGRESS, prog.getProgress());
					 Log.d("SS", "update: " + progval);
					 prog.setProgress((int) progval);
					 if(progval >= 100){
						  adapter.changeCursor(sdc.getHistoryCursor());
						  adapter.notifyDataSetChanged();

					 }
				 }
			}
			  
		  };

		  this.registerReceiver(progressReceiver, new IntentFilter(ScanService.BROADCAST_SCAN_PROGRESS));
		 
		  removeReceiver = new BroadcastReceiver(){
				@Override
				public void onReceive(Context c, Intent i) {
					 Log.d("SS", "Got App Remove");
					if(i.hasExtra("args")){
						showDialog(REMOVE_APP_DIALOG, i.getBundleExtra("args"));
					}
				}
				  
			  };
			  
	      this.registerReceiver(removeReceiver, new IntentFilter(ScanService.REMOVE_MAL_APP));
			  
		Intent i = new Intent(this, ScanService.class);
		startService(i);

	}
	
	@Override
	public void onRestoreInstanceState(Bundle savedInstanceState) {

	}
	
	
	@Override
	public void onSaveInstanceState(Bundle outState) {

	}

	@Override
	public boolean onCreateOptionsMenu(Menu menu) {
		// Inflate the menu; this adds items to the action bar if it is present.
		getMenuInflater().inflate(R.menu.activity_main, menu);
		
		return true;
	}
	
	@Override
	public boolean onOptionsItemSelected(MenuItem item){
		switch(item.getItemId()){
			default:
				return true;
		}
	}

	@Override
	public void onClick(View v) {
		if(v.getId() == R.id.scanButton){
			Intent i = new Intent(this, ScanService.class);
			i.setAction(ScanService.ACTION_SCAN_APPS);
			startService(i);
		}
	}


    @Override
    public Dialog onCreateDialog(int id, Bundle args) {
    	if(id == REMOVE_APP_DIALOG ){
    		if(args != null){
		    	String appname = "";
		    	String sig = "";
		    	final String packageName;
		    	if(args.containsKey("sig")){
		    		sig = args.getString("sig");
		    	}
		    	if(args.containsKey("app_name")){
		    		appname = args.getString("app_name");
		    	}
		    	if(args.containsKey("package_name")){
		    		packageName = args.getString("package_name");
		    	}
		    	else{
		    		packageName = "";
		    	}
		        AlertDialog.Builder builder = new AlertDialog.Builder(this);
		        builder.setTitle("Try to Remove " + appname + "?");
		        builder.setMessage("Serious Malicious Behavior detected!\n" + sig);
		        builder.setPositiveButton("Yes", new DialogInterface.OnClickListener() {
		                   public void onClick(DialogInterface dialog, int id) {
		                	   Uri packageURI = Uri.parse("package:"+packageName);
		                	   Intent uninstallIntent = new Intent(Intent.ACTION_DELETE, packageURI);
		                	   startActivity(uninstallIntent);
		                   }
		               })
		               .setNegativeButton("No", new DialogInterface.OnClickListener() {
		                   public void onClick(DialogInterface dialog, int id) {
		                       dialog.cancel();
		                   }
		               });
		        return builder.create();
    		}
    	}
    	else if (id == SHOW_HIST_DIALOG){
    		if(args != null){
		    	String text = "";
		    	if(args.containsKey(SignatureDatabaseConnection.FILENAME)){
		    		text  += "Filename: " + args.getString(SignatureDatabaseConnection.FILENAME) + "\n";
		    	}
		    	if(args.containsKey(SignatureDatabaseConnection.TIME)){
		    		text  += "Alert Time: " + args.getString(SignatureDatabaseConnection.TIME) + "\n";
		    	}
		    	if(args.containsKey(SignatureDatabaseConnection.DATA)){
		    		text  += "Cause: " + args.getString(SignatureDatabaseConnection.DATA) + "\n";
		    	}
		    	if(args.containsKey(SignatureDatabaseConnection.LEVEL)){
		    		text  += "Level: " + args.getString(SignatureDatabaseConnection.LEVEL);
		    	}
		    	if(args.containsKey(SignatureDatabaseConnection.TYPE)){
		    		text  += " Type: " + args.getString(SignatureDatabaseConnection.TYPE) + "\n";
		    	}
		    	if(args.containsKey(SignatureDatabaseConnection.DESCRIPTION)){
		    		text  += args.getString(SignatureDatabaseConnection.DESCRIPTION);
		    	}
		        AlertDialog.Builder builder = new AlertDialog.Builder(this);
		        builder.setTitle("Alert Details");
		        builder.setMessage(text);
		        builder.setPositiveButton("OK", new DialogInterface.OnClickListener() {
		                   public void onClick(DialogInterface dialog, int id) {
		                	   	dialog.dismiss();
		                   }
		               });
		        return builder.create();
    		}
    	}
    	return null;
    }

	
	public void onDestroy(){
		unregisterReceiver(progressReceiver);
		unregisterReceiver(removeReceiver);
		super.onDestroy();
	}

	@Override
	public void onItemClick(AdapterView<?> av, View v, int pos, long arg3) {
		Cursor c = (Cursor)av.getAdapter().getItem(pos);
		int id_row = c.getColumnIndex(SignatureDatabaseConnection.ID);
		if(id_row != -1){
			String id = c.getString(id_row);
			
			//generate data
			Cursor history = sdc.getHistoryDetails(id);
			Bundle item = new Bundle();
			int desc_row = c.getColumnIndex(SignatureDatabaseConnection.DESCRIPTION);
			if(desc_row != -1){
				String desc = c.getString(desc_row);
				item.putString(SignatureDatabaseConnection.DESCRIPTION, desc);
			}
			int data_row = c.getColumnIndex(SignatureDatabaseConnection.DATA);
			if(data_row != -1){
				String data = c.getString(data_row);
				item.putString(SignatureDatabaseConnection.DATA, data);
			}
			int level_row = c.getColumnIndex(SignatureDatabaseConnection.LEVEL);
			if(level_row != -1){
				String level = c.getString(level_row);
				item.putString(SignatureDatabaseConnection.LEVEL, level);
			}
			int name_row = c.getColumnIndex(SignatureDatabaseConnection.FILENAME);
			if(name_row != -1){
				String filename = c.getString(name_row);
				item.putString(SignatureDatabaseConnection.FILENAME, filename);
			}
			int type_row = c.getColumnIndex(SignatureDatabaseConnection.TYPE);
			if(type_row != -1){
				String type = c.getString(type_row);
				item.putString(SignatureDatabaseConnection.TYPE, type);
			}
			int time_row = c.getColumnIndex(SignatureDatabaseConnection.TIME);
			if(time_row != -1){
				String time = c.getString(time_row);
				item.putString(SignatureDatabaseConnection.TIME, time);
			}

			//create popup with data
			this.showDialog(SHOW_HIST_DIALOG, item);
			history.close();
		}
		Log.i("MA", c.getPosition() + "");
	}

}
