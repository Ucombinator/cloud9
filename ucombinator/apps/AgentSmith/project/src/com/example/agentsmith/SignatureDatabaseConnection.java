/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

import com.example.agentsmith.MaliciousSignature.LevelEnum;

public class SignatureDatabaseConnection extends SQLiteOpenHelper{

	private static final String DATABASE_NAME = "SIG_DB";
	
	private static final String SIG_TABLE_NAME = "sig_table";

	 static final String SOURCE = "source";
	 static final String TYPE = "sigtype";
	 static final String LEVEL = "lev";
	 static final String DATA = "sigdata";
	 static final String DESCRIPTION = "des";
	 private static final String SIG_TABLE_CREATE =
             "CREATE TABLE IF NOT EXISTS " + SIG_TABLE_NAME + " (" +
            		 SOURCE + " TEXT, "+
            		 TYPE + " TEXT, " +
            		 LEVEL + " TEXT, " +
            		 DESCRIPTION + " TEXT, " +
             		DATA + " TEXT);"; 
		private static final String HISTORY_TABLE_NAME = "history_table";

		 static final String ID = "_id";
		 static final String TIME = "detecttime";
		 //private static final String TYPE = "date";

		 static final String FILENAME = "fname";
		 private static final String HIST_TABLE_CREATE =
	             "CREATE TABLE IF NOT EXISTS " + HISTORY_TABLE_NAME + " ( "+ ID  + " INTEGER PRIMARY KEY AUTOINCREMENT, " +
	            		 TIME + 	" TEXT, "+
	            		 DATA + 	" TEXT, " +
	            		 TYPE + 	" TEXT, " +
	            		 FILENAME + " TEXT, " +
	            		 LEVEL + 	" TEXT, " +
	            		 DESCRIPTION + " TEXT);"; 
	public static enum SignatureSource{
		Application, Clipboard, File, Phone, Contact
	}

	private Context c;
	public SignatureDatabaseConnection(Context context) {
		super(context, DATABASE_NAME, null, 1);
		c = context;
		//Register crashdump handler for developer debugging.
		Thread.setDefaultUncaughtExceptionHandler(
                new CrashdumpHandler(context));
		//deleteDB(this.getWritableDatabase());
	}

	private void deleteDB(SQLiteDatabase db) {
		Log.i("SDC", "deleting database");
		db.execSQL("Drop table if exists " + HISTORY_TABLE_NAME + ";");
		db.execSQL("Drop table if exists " + SIG_TABLE_NAME + ";");
		onCreate(db);
	}

	@Override
	public void onCreate(SQLiteDatabase db) {
		Log.i("SDC", "creating database");
		Log.i("SDC",HIST_TABLE_CREATE);
		db.execSQL(SIG_TABLE_CREATE);
		db.execSQL(HIST_TABLE_CREATE);
		
		addSigsFromFile(R.raw.init_sigs, db);
	}

	@Override
	public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
		// TODO Auto-generated method stub
		
	}

	public List<MaliciousSignature> getSignatures(String name,
			SignatureSource source, String type) {
		SQLiteDatabase db= this.getReadableDatabase();
		List<MaliciousSignature> detectedSigs = new ArrayList<MaliciousSignature>();
		String[] args = {
				DESCRIPTION,
				DATA,
				LEVEL
		};
		
		String where = SOURCE  + " = '" + source.name() + "' and " + TYPE + " = '" + type + "'";
		//Log.d("SDC", "WHERE: " + where);
		Date d =  Calendar.getInstance().getTime();
		DateFormat formatter = new SimpleDateFormat("dd-MM-yyyy HH:mm:ss");
		String timestamp = formatter.format(d);
		
		Cursor c = db.query(true, SIG_TABLE_NAME, args, where, null, null, null, null, null);
		int data_row = c.getColumnIndex(DATA);
		Log.d("SDC", "SIGS FOUND: " + c.getCount());
		while(c.moveToNext()){
			if(data_row != -1){
				String sig = c.getString(data_row);
				if(matchesRegex(name, sig)){
					Log.d("SDC", "SIG: " + sig);
					int level_row = c.getColumnIndex(LEVEL);
					String levelstr = c.getString(level_row);
					LevelEnum le = LevelEnum.valueOf(levelstr);
					int desc_row = c.getColumnIndex(DESCRIPTION);
					String descstr = c.getString(desc_row);
					MaliciousSignature newSig = new MaliciousSignature(source, type, sig, timestamp, le,name,descstr);
					detectedSigs.add(newSig);
				}
			}
		}
		c.close();
		//db.close();
		return detectedSigs;
	}
	
	
	public int getSignatureCount() {
		SQLiteDatabase db= this.getReadableDatabase();
		String[] args = {
				SOURCE,
				TYPE,
				DATA,
				LEVEL
		};
		
	
		Cursor c = db.query(true, SIG_TABLE_NAME, args, null, null, null, null, null, null);
		int ret = c.getCount();
//		int source_i = c.getColumnIndex(SOURCE);
//		int type_i = c.getColumnIndex(TYPE);
//		if(c.moveToNext()){
//			Log.e("SDC", "S: " + c.getString(source_i) + " T: " + c.getString(type_i));//
//		}
		c.close();
		return ret;
	}
	
	public void addSig(SignatureSource ss, String type, LevelEnum le, String data){
		SQLiteDatabase db = this.getWritableDatabase();
		ContentValues cv = new ContentValues();
		cv.put(SOURCE, ss.name());
		cv.put(TYPE, type);
		cv.put(LEVEL, le.name());
		cv.put(DATA, data);
		db.insert(SIG_TABLE_NAME, null, cv);
		db.close();
	}
	
	public void addSigsFromFile(int sigResource,SQLiteDatabase db ){
		 InputStream istream = c.getResources().openRawResource(sigResource);
		 InputStreamReader isreader = new InputStreamReader(istream);
         BufferedReader breader = new BufferedReader(isreader);
          String line;

          try {
            while ((line = breader.readLine()) != null) {
            	if(!line.equals("")){
            		//match comma separated and quoted tokens
            		 String[] tokens = line.split(",(?=([^\"]*\"[^\"]*\")*[^\"]*$)");

	            	String source = "";
	            	String type = "";
	            	String level = "";
	            	String data = "";
	            	String desc = "";
	            	if(tokens.length > 0){
	            		source = tokens[0];
	            	}
	            	if(tokens.length > 1){
	            		type =  tokens[1];
	            	}
	            	if(tokens.length > 2){
	            		level =  tokens[2];
	            	}
	            	if(tokens.length > 3){
	            	
	            		data =  tokens[3];
	            		if(data.startsWith("\"") && data.endsWith("\"")){
	            			data = data.substring(1, data.length()-1);
	            		}
	            	}
	            	
	            	if(tokens.length > 4){
		            	
	            		desc =  tokens[4];
	            		if(desc.startsWith("\"") && desc.endsWith("\"")){
	            			desc = desc.substring(1, desc.length()-1);
	            		}
	            	}
	            	Log.e("SDC", "S:" + source + "T:" + type+ "L:" + level + "D:" + data);
	        		ContentValues cv = new ContentValues();
	        		cv.put(SOURCE, source);
	        		cv.put(TYPE, type);
	        		cv.put(LEVEL, level);
	        		cv.put(DATA, data);
	        		cv.put(DESCRIPTION, desc);
	        		db.insert(SIG_TABLE_NAME, null, cv);
            	}
             }
        } catch (IOException e) {
            e.printStackTrace();
        }
		
		
	}
	
	@Override
	public void finalize(){
		this.close();
		try {
			super.finalize();
		} catch (Throwable e) {
			e.printStackTrace();
		}
	}
	
	private boolean matchesRegex(String name, String sig) {
		
		Pattern pattern = Pattern.compile(sig);
		Matcher matcher = pattern.matcher(name);
		Log.d("SDC", "Matching " + name + " to " + sig);
		
		if (matcher.matches() || matcher.find()) {
			return true;
		}
		else{
			return false;
		}
	}

	public void addHistory(String timestamp, String type, String description, String filename, String data, LevelEnum level){
		SQLiteDatabase db = this.getWritableDatabase();
		ContentValues cv = new ContentValues();
		cv.put(TIME, timestamp);
		cv.put(TYPE, type);
		cv.put(DESCRIPTION, description);
		cv.put(FILENAME, filename);
		cv.put(DATA, data);
		cv.put(LEVEL, level.name());
		Log.e("SDC", "LEV: " + level.name());
		Log.e("SDC", "DESC: " + description);
		db.insert(HISTORY_TABLE_NAME, null, cv);
		db.close();
	}

	public Cursor getHistoryCursor() {
		
			//restrict to alerts above a certain level
			SQLiteDatabase db= this.getReadableDatabase();
			String[] args = {
					ID,
					TIME,
					TYPE,
					FILENAME
			};
			
			
			String where = LEVEL + " = '" + LevelEnum.Severe.name() + "' or "+ LEVEL + " = '"+ LevelEnum.Moderate.name() + "'";
			Cursor c = db.query(true, HISTORY_TABLE_NAME, args, where, null, null, null, ID +" DESC", null);
		return c;
	}

	public Cursor getHistoryCursorAll() {
		
			SQLiteDatabase db= this.getReadableDatabase();
			String[] args = {
					ID,
					TIME,
					TYPE,
					FILENAME,
					DESCRIPTION,
					DATA
			};
			
			Cursor c = db.query(true, HISTORY_TABLE_NAME, args, null, null, null, null, ID +" DESC", null);
		return c;
	}

	public Cursor getHistoryDetails(String id) {
		//restrict to alerts above a certain level
		SQLiteDatabase db= this.getReadableDatabase();
		String[] args = {
				ID,
				TIME,
				TYPE,
				FILENAME,
				DATA,
				LEVEL,
				DESCRIPTION
				
		};
		
		
		String where = ID + " = '" + id + "'";
		Cursor c = db.query(true, HISTORY_TABLE_NAME, args, where, null, null, null, null, null);
		return c;
	}

}
